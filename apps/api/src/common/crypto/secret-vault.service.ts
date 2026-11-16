import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface EncryptedSecretPayload {
  __encrypted: true;
  version: 1;
  iv: string; // base64
  tag: string; // base64
  ciphertext: string; // base64
}

/**
 * Encrypts tenant-scoped credentials and application environment variables at rest using AES-256-GCM.
 */
@Injectable()
export class SecretVaultService {
  private readonly logger = new Logger(SecretVaultService.name);
  private readonly key: Buffer;

  constructor() {
    this.key = this.resolveKey();
  }

  /**
   * Resolves the 256-bit encryption key.
   * Priority:
   * 1. TENANT_SECRETS_ENCRYPTION_KEY
   * 2. ENCRYPTION_KEY
   * 3. Derived from AGENT_SECRET_KEY using SHA-256
   */
  private resolveKey(): Buffer {
    const rawKey =
      process.env.TENANT_SECRETS_ENCRYPTION_KEY ||
      process.env.ENCRYPTION_KEY ||
      process.env.AGENT_SECRET_KEY ||
      'default-fallback-aetherhost-insecure-key-32b';

    return crypto.createHash('sha256').update(rawKey).digest();
  }

  /**
   * Encrypts a key-value record of tenant secrets using AES-256-GCM.
   */
  encrypt(data: Record<string, string> | null | undefined): EncryptedSecretPayload | null {
    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);

    const plaintext = JSON.stringify(data);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    return {
      __encrypted: true,
      version: 1,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };
  }

  /**
   * Decrypts an encrypted payload, or returns the plaintext object if legacy unencrypted.
   */
  decrypt(payload: unknown): Record<string, string> {
    if (!payload || typeof payload !== 'object') {
      return {};
    }

    // Check if the payload is an encrypted envelope
    if (this.isEncryptedPayload(payload)) {
      try {
        const iv = Buffer.from(payload.iv, 'base64');
        const tag = Buffer.from(payload.tag, 'base64');
        const ciphertext = Buffer.from(payload.ciphertext, 'base64');

        const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
        decipher.setAuthTag(tag);

        const plaintext = Buffer.concat([
          decipher.update(ciphertext),
          decipher.final(),
        ]).toString('utf8');

        return JSON.parse(plaintext);
      } catch (err: any) {
        this.logger.error(`Decryption failed: ${err.message}`);
        throw new Error('Failed to decrypt secret payload: authentication failed or corrupted ciphertext');
      }
    }

    // Legacy unencrypted object: return directly
    return payload as Record<string, string>;
  }

  /**
   * Type guard to detect encrypted secret envelopes.
   */
  isEncryptedPayload(payload: any): payload is EncryptedSecretPayload {
    return Boolean(
      payload &&
      typeof payload === 'object' &&
      payload.__encrypted === true &&
      payload.version === 1 &&
      typeof payload.iv === 'string' &&
      typeof payload.tag === 'string' &&
      typeof payload.ciphertext === 'string'
    );
  }
}
