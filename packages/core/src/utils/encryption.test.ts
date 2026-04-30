import { describe, expect, it } from 'vitest';
import { EncryptionService } from './encryption.js';

describe('EncryptionService', () => {
  const service = new EncryptionService('my-secret-passphrase');

  it('should encrypt and decrypt text', () => {
    const plaintext = 'Hello, sensitive world!';
    const encrypted = service.encrypt(plaintext);

    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.tag).toBeDefined();
    expect(encrypted.ciphertext).not.toBe(plaintext);

    const decrypted = service.decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertexts for same plaintext', () => {
    const plaintext = 'test';
    const encrypted1 = service.encrypt(plaintext);
    const encrypted2 = service.encrypt(plaintext);

    expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
    expect(encrypted1.iv).not.toBe(encrypted2.iv);

    expect(service.decrypt(encrypted1)).toBe(plaintext);
    expect(service.decrypt(encrypted2)).toBe(plaintext);
  });

  it('should accept a raw buffer key', () => {
    const key = Buffer.alloc(32, 0xab);
    const bufferService = new EncryptionService(key);
    const encrypted = bufferService.encrypt('data');
    expect(bufferService.decrypt(encrypted)).toBe('data');
  });

  it('should throw on tampered ciphertext', () => {
    const encrypted = service.encrypt('secret');
    encrypted.ciphertext = `${encrypted.ciphertext.slice(0, -4)}dead`;
    expect(() => service.decrypt(encrypted)).toThrow();
  });
});
