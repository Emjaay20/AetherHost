import * as crypto from 'crypto';
import { SecretVaultService } from './secret-vault.service';

describe('SecretVaultService', () => {
  let vault: SecretVaultService;

  beforeEach(() => {
    process.env.TENANT_SECRETS_ENCRYPTION_KEY = 'test-secret-key-32-bytes-long-super-safe!';
    vault = new SecretVaultService();
  });

  afterEach(() => {
    delete process.env.TENANT_SECRETS_ENCRYPTION_KEY;
  });

  it('encrypts and decrypts tenant environment variables accurately', () => {
    const original = {
      DATABASE_URL: 'postgresql://dbuser:mock_password@db.internal:5432/mockdb',
      STRIPE_SECRET_KEY: 'mock_stripe_test_secret_sample',
      DEPLOY_TOKEN: 'mock_deployment_token_sample_abc',
    };

    const encrypted = vault.encrypt(original);
    expect(encrypted).not.toBeNull();
    expect(encrypted?.__encrypted).toBe(true);
    expect(encrypted?.version).toBe(2);

    // Ensure raw secrets do not appear in the serialized envelope
    const serialized = JSON.stringify(encrypted);
    expect(serialized).not.toContain('mock_password');
    expect(serialized).not.toContain('mock_stripe_test');
    expect(serialized).not.toContain('ghp_secret');

    // Decrypt and compare
    const decrypted = vault.decrypt(encrypted);
    expect(decrypted).toEqual(original);
  });

  it('generates unique initialization vectors (IV) for identical payloads', () => {
    const payload = { API_KEY: 'same-key-every-time' };
    const enc1 = vault.encrypt(payload);
    const enc2 = vault.encrypt(payload);

    expect(enc1?.iv).not.toEqual(enc2?.iv);
    expect(enc1?.ciphertext).not.toEqual(enc2?.ciphertext);

    expect(vault.decrypt(enc1)).toEqual(payload);
    expect(vault.decrypt(enc2)).toEqual(payload);
  });

  it('detects tampering and rejects corrupted ciphertext or tags', () => {
    const payload = { SECRET: 'confidential' };
    const encrypted = vault.encrypt(payload)!;

    // Tamper with ciphertext
    const tampered = {
      ...encrypted,
      ciphertext: Buffer.from('corrupted-data').toString('base64'),
    };

    expect(() => vault.decrypt(tampered)).toThrow(/authentication failed/);
  });

  it('supports legacy unencrypted JSON objects seamlessly (backward compatibility)', () => {
    const legacyPlaintext = {
      NODE_ENV: 'production',
      PORT: '8080',
    };

    const result = vault.decrypt(legacyPlaintext);
    expect(result).toEqual(legacyPlaintext);
  });

  it('handles null, undefined, and empty objects gracefully', () => {
    expect(vault.encrypt(null)).toBeNull();
    expect(vault.encrypt(undefined)).toBeNull();
    expect(vault.encrypt({})).toBeNull();

    expect(vault.decrypt(null)).toEqual({});
    expect(vault.decrypt(undefined)).toEqual({});
  });
  it('fails closed without dedicated keys outside tests', () => {
    const saved = { ...process.env };
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.TENANT_SECRETS_ENCRYPTION_KEY;
      delete process.env.TENANT_SECRETS_KEYRING;
      process.env.AGENT_SECRET_KEY = 'agent-key-is-not-a-vault-key';
      expect(() => new SecretVaultService()).toThrow(/Configure/);
    } finally { process.env = saved; }
  });

  it('rejects ciphertext moved to another application', () => {
    const payload = vault.encrypt({ TOKEN: 'secret' }, 'application:alpha:one');
    expect(vault.decrypt(payload, 'application:alpha:one')).toEqual({ TOKEN: 'secret' });
    expect(() => vault.decrypt(payload, 'application:beta:two')).toThrow(/authentication failed/);
    expect(() => vault.decrypt({ ...payload, context: 'application:beta:two' }, 'application:beta:two')).toThrow(/authentication failed/);
  });

  it('rotates keys while reading old records and rejects a retired key', () => {
    const saved = { ...process.env };
    try {
      const keys = { old: crypto.randomBytes(32).toString('base64'), next: crypto.randomBytes(32).toString('base64') };
      process.env.TENANT_SECRETS_KEYRING = JSON.stringify(keys);
      process.env.TENANT_SECRETS_CURRENT_KEY_ID = 'old';
      const old = new SecretVaultService().encrypt({ TOKEN: 'secret' });
      process.env.TENANT_SECRETS_CURRENT_KEY_ID = 'next';
      const rotated = new SecretVaultService();
      expect(rotated.decrypt(old)).toEqual({ TOKEN: 'secret' });
      expect(rotated.encrypt(rotated.decrypt(old))?.keyId).toBe('next');
      process.env.TENANT_SECRETS_KEYRING = JSON.stringify({ next: keys.next });
      expect(() => new SecretVaultService().decrypt(old)).toThrow(/authentication failed/);
    } finally { process.env = saved; }
  });

  it('rejects malformed envelopes instead of treating them as legacy plaintext', () => {
    for (const payload of [{ __encrypted: true, version: 99 }, { __encrypted: false }, { TOKEN: 42 }]) {
      expect(() => vault.decrypt(payload)).toThrow();
    }
  });

  it('reads authentic version 1 records for migration', () => {
    const iv = crypto.randomBytes(12);
    const key = crypto.createHash('sha256').update(process.env.TENANT_SECRETS_ENCRYPTION_KEY!).digest();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ TOKEN: 'old' })), cipher.final()]);
    expect(vault.decrypt({ __encrypted: true, version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') })).toEqual({ TOKEN: 'old' });
  });

});
