import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

export interface EncryptedSecretPayload {
  __encrypted: true;
  version: 2;
  keyId: string;
  context: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

/** Application encryption. Key wrapping / KMS is a separate integration. */
@Injectable()
export class SecretVaultService {
  private readonly keys = new Map<string, Buffer>();
  private readonly currentKeyId: string;
  private readonly legacyKey?: Buffer;

  constructor() {
    const configured = process.env.TENANT_SECRETS_KEYRING;
    const dedicated = process.env.TENANT_SECRETS_ENCRYPTION_KEY;
    this.currentKeyId = process.env.TENANT_SECRETS_CURRENT_KEY_ID || 'primary';
    if (configured) {
      const parsed: unknown = JSON.parse(configured);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('TENANT_SECRETS_KEYRING must be an object of base64 keys');
      }
      for (const [id, value] of Object.entries(parsed)) {
        if (!id || typeof value !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value)) {
          throw new Error('Keyring entries must be named base64-encoded 32-byte keys');
        }
        const key = Buffer.from(value, 'base64');
        if (key.length !== 32 || key.toString('base64') !== value) throw new Error('Invalid encryption key');
        this.keys.set(id, key);
      }
    } else if (dedicated && dedicated.length >= 32) {
      // Preserve the previous dedicated-key derivation during staged upgrades.
      this.keys.set(this.currentKeyId, crypto.createHash('sha256').update(dedicated).digest());
    } else if (process.env.NODE_ENV === 'test') {
      this.keys.set(this.currentKeyId, crypto.randomBytes(32));
    } else {
      throw new Error('Configure TENANT_SECRETS_KEYRING or a dedicated TENANT_SECRETS_ENCRYPTION_KEY (32+ characters)');
    }
    if (!this.keys.has(this.currentKeyId)) throw new Error('Current encryption key ID is absent from keyring');
    // Read-only compatibility for v1 records; never use agent credentials for new writes.
    const legacy = process.env.TENANT_SECRETS_LEGACY_KEY || dedicated || process.env.ENCRYPTION_KEY || process.env.AGENT_SECRET_KEY;
    if (legacy) this.legacyKey = crypto.createHash('sha256').update(legacy).digest();
  }

  encrypt(data: Record<string, string> | null | undefined, context = 'platform'): EncryptedSecretPayload | null {
    if (!data || Object.keys(data).length === 0) return null;
    this.validateRecord(data);
    if (!context) throw new Error('Secret context is required');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.keys.get(this.currentKeyId)!, iv);
    cipher.setAAD(Buffer.from(JSON.stringify([2, this.currentKeyId, context])));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
    return { __encrypted: true, version: 2, keyId: this.currentKeyId, context,
      iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
  }

  decrypt(payload: unknown, context = 'platform'): Record<string, string> {
    if (payload == null) return {};
    if (typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid secret payload');
    const value = payload as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(value, '__encrypted')) {
      this.validateRecord(value);
      return value as Record<string, string>;
    }
    try {
      if (value.__encrypted !== true || (value.version !== 1 && value.version !== 2)) throw new Error('Invalid envelope');
      const iv = this.decode(value.iv, 12);
      const tag = this.decode(value.tag, 16);
      const ciphertext = this.decode(value.ciphertext);
      let key: Buffer | undefined;
      if (value.version === 2) {
        if (value.context !== context || typeof value.keyId !== 'string') throw new Error('Context mismatch');
        key = this.keys.get(value.keyId);
      } else key = this.legacyKey;
      if (!key) throw new Error('Unknown encryption key');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      if (value.version === 2) decipher.setAAD(Buffer.from(JSON.stringify([2, value.keyId, context])));
      decipher.setAuthTag(tag);
      const parsed: unknown = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
      this.validateRecord(parsed);
      return parsed as Record<string, string>;
    } catch {
      throw new Error('Failed to decrypt secret payload: authentication failed or corrupted ciphertext');
    }
  }

  isEncryptedPayload(payload: unknown): payload is EncryptedSecretPayload {
    if (!payload || typeof payload !== 'object') return false;
    const value = payload as Record<string, unknown>;
    return value.__encrypted === true && value.version === 2 && typeof value.keyId === 'string' &&
      typeof value.context === 'string' && typeof value.iv === 'string' && typeof value.tag === 'string' && typeof value.ciphertext === 'string';
  }

  private decode(value: unknown, length?: number): Buffer {
    if (typeof value !== 'string' || !value || value.length % 4 !== 0) throw new Error('Invalid base64');
    const decoded = Buffer.from(value, 'base64');
    if (decoded.toString('base64') !== value || (length !== undefined && decoded.length !== length)) throw new Error('Invalid encoded payload');
    return decoded;
  }

  private validateRecord(value: unknown): void {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.values(value).some(v => typeof v !== 'string')) {
      throw new Error('Secrets must be a string dictionary');
    }
  }
}
