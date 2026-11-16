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
    expect(encrypted?.version).toBe(1);

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
});
