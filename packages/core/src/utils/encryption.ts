import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const SALT_LENGTH = 32;

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
}

export interface EncryptionServiceOptions {
  salt?: string | Buffer;
}

export class EncryptionService {
  private _key: Buffer;
  private _salt: Buffer;

  constructor(keyOrPassphrase: string | Buffer, options: EncryptionServiceOptions = {}) {
    if (Buffer.isBuffer(keyOrPassphrase) && keyOrPassphrase.length === KEY_LENGTH) {
      this._key = keyOrPassphrase;
      this._salt = Buffer.from(options.salt ?? randomBytes(SALT_LENGTH));
    } else {
      this._salt = options.salt ? Buffer.from(options.salt) : randomBytes(SALT_LENGTH);
      this._key = scryptSync(String(keyOrPassphrase), this._salt, KEY_LENGTH);
    }
  }

  get salt(): Buffer {
    return this._salt;
  }

  encrypt(plaintext: string): EncryptedPayload {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this._key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
    };
  }

  decrypt(payload: EncryptedPayload): string {
    const decipher = createDecipheriv(ALGORITHM, this._key, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }
}
