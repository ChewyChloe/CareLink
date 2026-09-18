import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface IMessageBodyProtector {
  encrypt(plaintext: string): string;
  decrypt(ciphertextWithMeta: string): string;
}

@Injectable()
export class MessageEncryptionService implements IMessageBodyProtector {
  private readonly logger = new Logger(MessageEncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const rawKey = this.configService.get<string>('MESSAGE_ENCRYPTION_KEY') || 'carelink_dev_encryption_key_32bytes_min!';
    // Derive a 32-byte key deterministically via sha256 to ensure exact key length
    this.key = crypto.createHash('sha256').update(rawKey).digest();
  }

  /**
   * Encrypts plaintext using AES-256-GCM.
   * Output format: `iv:authTag:encryptedData` (hex encoded)
   */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Decrypts and authenticates ciphertext using AES-256-GCM.
   */
  decrypt(ciphertextWithMeta: string): string {
    const parts = ciphertextWithMeta.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format');
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
