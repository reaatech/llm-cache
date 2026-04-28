import { describe, it, expect } from 'vitest';
import { sha256, buildPromptHash, buildCacheFingerprint, buildExactMatchKey } from './hash.js';

describe('hash utilities', () => {
  it('sha256 should produce a 64-character hex string', () => {
    const hash = sha256('hello');
    expect(hash).toHaveLength(64);
    expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
  });

  it('sha256 should be deterministic', () => {
    expect(sha256('hello')).toBe(sha256('hello'));
    expect(sha256('hello')).not.toBe(sha256('world'));
  });

  it('buildPromptHash should use sha256', () => {
    expect(buildPromptHash('test')).toBe(sha256('test'));
  });

  it('buildCacheFingerprint should hash generation config', () => {
    const fp1 = buildCacheFingerprint({
      model: 'gpt-4',
      modelVersion: 'gpt-4-0613',
      temperature: 0.5,
    });
    const fp2 = buildCacheFingerprint({
      model: 'gpt-4',
      modelVersion: 'gpt-4-0613',
      temperature: 0.5,
    });
    const fp3 = buildCacheFingerprint({
      model: 'gpt-4',
      modelVersion: 'gpt-4-0613',
      temperature: 1.0,
    });

    expect(fp1).toHaveLength(64);
    expect(fp1).toBe(fp2);
    expect(fp1).not.toBe(fp3);
  });

  it('buildCacheFingerprint should handle optional fields', () => {
    const fp = buildCacheFingerprint({
      model: 'gpt-4',
      modelVersion: 'gpt-4-0613',
    });
    expect(fp).toHaveLength(64);
  });

  it('buildExactMatchKey should combine components with hashed useCase', () => {
    const key = buildExactMatchKey('promptHash', 'qa', 'configHash');
    const parts = key.split(':');
    expect(parts).toHaveLength(3);
    expect(parts[1]).toBe('configHash');
    expect(parts[2]).toBe('promptHash');
    // Hashed useCase should be deterministic
    expect(buildExactMatchKey('promptHash', 'qa', 'configHash')).toBe(key);
  });

  it('buildExactMatchKey should disambiguate useCase values that collide on the delimiter', () => {
    const a = buildExactMatchKey('p', 'a:b', 'c');
    const b = buildExactMatchKey('p', 'a', 'b:c');
    expect(a).not.toBe(b);
  });
});
