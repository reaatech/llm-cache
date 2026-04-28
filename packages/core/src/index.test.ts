import { describe, it, expect } from 'vitest';
import * as core from './index.js';

describe('core exports', () => {
  it('should export CacheEngine', () => {
    expect(core.CacheEngine).toBeDefined();
  });

  it('should export InMemoryAdapter', () => {
    expect(core.InMemoryAdapter).toBeDefined();
  });

  it('should export OpenAIEmbedder', () => {
    expect(core.OpenAIEmbedder).toBeDefined();
  });

  it('should export SimilarityMatcher', () => {
    expect(core.SimilarityMatcher).toBeDefined();
  });

  it('should export CacheConfigSchema', () => {
    expect(core.CacheConfigSchema).toBeDefined();
  });

  it('should export hash utilities', () => {
    expect(core.sha256).toBeDefined();
    expect(core.buildPromptHash).toBeDefined();
    expect(core.buildCacheFingerprint).toBeDefined();
    expect(core.buildExactMatchKey).toBeDefined();
  });

  it('should export EncryptionService', () => {
    expect(core.EncryptionService).toBeDefined();
  });
});
