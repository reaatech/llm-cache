import { describe, expect, it, vi } from 'vitest';
import type { VectorStorageAdapter } from '../storage/StorageAdapter.js';
import type { CacheEntry } from '../types/index.js';
import { SimilarityMatcher } from './SimilarityMatcher.js';

function makeEntry(embedding: number[], overrides?: Partial<CacheEntry>): CacheEntry {
  const now = new Date();
  return {
    id: 'test-id',
    prompt: 'test',
    promptHash: 'hash',
    response: 'response',
    embedding,
    model: 'gpt-4',
    modelVersion: 'gpt-4-0613',
    generationConfigHash: 'cfg',
    embeddingModel: 'text-embedding-3-small',
    embeddingDimensions: embedding.length,
    useCase: 'general',
    sensitive: false,
    tokens: { prompt: 10, completion: 20, total: 30 },
    cost: { prompt: 0.001, completion: 0.002, total: 0.003 },
    metadata: {
      createdAt: now,
      ttl: 3600,
      expiresAt: new Date(now.getTime() + 3600_000),
      queryType: 'factual',
    },
    ...overrides,
  };
}

describe('SimilarityMatcher', () => {
  it('should filter expired entries', async () => {
    const validEntry = makeEntry([1, 0, 0], { id: 'valid' });
    const expiredEntry = makeEntry([0.9, 0.1, 0], {
      id: 'expired',
      metadata: {
        createdAt: new Date(Date.now() - 7200_000),
        ttl: 3600,
        expiresAt: new Date(Date.now() - 3600_000),
        queryType: 'factual',
      },
    });

    const mockStorage = {
      findSimilar: vi.fn().mockResolvedValue([
        { entry: validEntry, similarity: 0.95 },
        { entry: expiredEntry, similarity: 0.9 },
      ]),
    } as unknown as VectorStorageAdapter;

    const matcher = new SimilarityMatcher(mockStorage);
    const results = await matcher.findSimilar([1, 0, 0], { useCase: 'general' }, 0.8, 10);

    expect(results).toHaveLength(1);
    expect(results[0].entry.id).toBe('valid');
  });

  it('should sort by similarity descending', async () => {
    const entryA = makeEntry([1, 0, 0], { id: 'a' });
    const entryB = makeEntry([0.9, 0.1, 0], { id: 'b' });

    const mockStorage = {
      findSimilar: vi.fn().mockResolvedValue([
        { entry: entryA, similarity: 0.8 },
        { entry: entryB, similarity: 0.95 },
      ]),
    } as unknown as VectorStorageAdapter;

    const matcher = new SimilarityMatcher(mockStorage);
    const results = await matcher.findSimilar([1, 0, 0], { useCase: 'general' }, 0.8, 10);

    expect(results[0].entry.id).toBe('b');
    expect(results[1].entry.id).toBe('a');
  });

  it('should respect limit', async () => {
    const entries = Array.from({ length: 5 }, (_, i) => makeEntry([1, 0, 0], { id: String(i) }));

    const mockStorage = {
      findSimilar: vi
        .fn()
        .mockResolvedValue(entries.map((e, i) => ({ entry: e, similarity: 0.9 - i * 0.01 }))),
    } as unknown as VectorStorageAdapter;

    const matcher = new SimilarityMatcher(mockStorage);
    const results = await matcher.findSimilar([1, 0, 0], { useCase: 'general' }, 0.8, 2);

    expect(results).toHaveLength(2);
  });

  it('should calculate cosine similarity correctly', () => {
    const matcher = new SimilarityMatcher({} as VectorStorageAdapter);

    expect(matcher.calculateCosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 5);
    expect(matcher.calculateCosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 5);
    expect(matcher.calculateCosineSimilarity([1, 1, 0], [1, 1, 0])).toBeCloseTo(1, 5);
  });

  it('should return 0 for zero vectors', () => {
    const matcher = new SimilarityMatcher({} as VectorStorageAdapter);
    expect(matcher.calculateCosineSimilarity([0, 0, 0], [1, 0, 0])).toBe(0);
    expect(matcher.calculateCosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(0);
  });

  it('should throw on dimension mismatch', () => {
    const matcher = new SimilarityMatcher({} as VectorStorageAdapter);
    expect(() => matcher.calculateCosineSimilarity([1, 0], [1, 0, 0])).toThrow(
      'dimension mismatch',
    );
  });
});
