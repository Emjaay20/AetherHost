import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface EncryptedSecretPayload {
  __encrypted: true;
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
}

/** Encrypts tenant-scoped provider credentials using AES-256-GCM. */
@Injectable()
export class SecretVaultService {
  private readonly logger = new Logger(SecretVaultService.name);
  private readonly key = this.resolveKey();

  private resolveKey(): Buffer {
    const rawKey = process.env.TENANT_SECRETS_ENCRYPTION_KEY
      || process.env.ENCRYPTION_KEY
      || process.env.AGENT_SECRET_KEY;
    if (!rawKey) {
      throw new Error('TENANT_SECRETS_ENCRYPTION_KEY, ENCRYPTION_KEY, or AGENT_SECRET_KEY is required for encrypted provider credentials');
    }
    return crypto.createHash('sha256').update(rawKey).digest();
  }

  encrypt(data: Record<string, string> | null | undefined): EncryptedSecretPayload | null {
    if (!data || Object.keys(data).length === 0) return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
    return {
      __encrypted: true,
      version: 1,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };
  }

  decrypt(payload: unknown): Record<string, string> {
    if (!this.isEncryptedPayload(payload)) {
      throw new Error('Encrypted provider credential payload is invalid');
    }
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(payload.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
    } catch (error) {
      this.logger.error(`Provider credential decryption failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      throw new Error('Encrypted provider credential could not be decrypted');
    }
  }

  private isEncryptedPayload(payload: unknown): payload is EncryptedSecretPayload {
    return Boolean(payload && typeof payload === 'object' && (payload as EncryptedSecretPayload).__encrypted === true
      && (payload as EncryptedSecretPayload).version === 1
      && typeof (payload as EncryptedSecretPayload).iv === 'string'
      && typeof (payload as EncryptedSecretPayload).tag === 'string'
      && typeof (payload as EncryptedSecretPayload).ciphertext === 'string');
  }
}
