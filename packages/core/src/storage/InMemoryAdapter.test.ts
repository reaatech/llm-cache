import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from './InMemoryAdapter.js';
import type { CacheEntry } from '../types/index.js';

function makeEntry(embedding: number[], overrides?: Partial<CacheEntry>): CacheEntry {
  const now = new Date();
  return {
    id: 'test-id',
    prompt: 'test prompt',
    promptHash: 'hash',
    response: 'response',
    embedding,
    model: 'gpt-4',
    modelVersion: 'gpt-4-0613',
    generationConfigHash: 'cfg-hash',
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

describe('InMemoryAdapter', () => {
  let adapter: InMemoryAdapter;

  beforeEach(() => {
    adapter = new InMemoryAdapter();
  });

  it('should store and retrieve entries', async () => {
    const entry = makeEntry([0.1, 0.2, 0.3]);
    await adapter.set('key1', entry);

    const retrieved = await adapter.get('key1');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.prompt).toBe('test prompt');
  });

  it('should return null for missing keys', async () => {
    const result = await adapter.get('missing');
    expect(result).toBeNull();
  });

  it('should delete entries', async () => {
    const entry = makeEntry([0.1, 0.2, 0.3]);
    await adapter.set('key1', entry);
    expect(await adapter.delete('key1')).toBe(true);
    expect(await adapter.get('key1')).toBeNull();
  });

  it('should find similar entries by cosine similarity', async () => {
    const entry1 = makeEntry([1, 0, 0], { id: 'e1', useCase: 'qa' });
    const entry2 = makeEntry([0.9, 0.1, 0], { id: 'e2', useCase: 'qa' });
    const entry3 = makeEntry([0, 0, 1], { id: 'e3', useCase: 'qa' });

    await adapter.set('k1', entry1);
    await adapter.set('k2', entry2);
    await adapter.set('k3', entry3);

    const results = await adapter.findSimilar([1, 0, 0], 0.8, { useCase: 'qa' }, 10);

    expect(results.length).toBe(2);
    expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
  });

  it('should filter by useCase in findSimilar', async () => {
    const entry1 = makeEntry([1, 0, 0], { id: 'e1', useCase: 'qa' });
    const entry2 = makeEntry([0.99, 0.01, 0], { id: 'e2', useCase: 'summarize' });

    await adapter.set('k1', entry1);
    await adapter.set('k2', entry2);

    const results = await adapter.findSimilar([1, 0, 0], 0.8, { useCase: 'qa' }, 10);
    expect(results.length).toBe(1);
    expect(results[0].entry.useCase).toBe('qa');
  });

  it('should invalidate by criteria', async () => {
    const entry1 = makeEntry([1, 0, 0], { id: 'e1', useCase: 'qa' });
    const entry2 = makeEntry([1, 0, 0], { id: 'e2', useCase: 'general' });

    await adapter.set('k1', entry1);
    await adapter.set('k2', entry2);

    const count = await adapter.invalidateByCriteria({ useCase: 'qa' });
    expect(count).toBe(1);
    expect(await adapter.get('k1')).toBeNull();
    expect(await adapter.get('k2')).not.toBeNull();
  });

  it('should enforce max size limit', async () => {
    const smallAdapter = new InMemoryAdapter({ maxSize: 2 });

    await smallAdapter.set('k1', makeEntry([1, 0, 0], { id: 'e1' }));
    await smallAdapter.set('k2', makeEntry([0, 1, 0], { id: 'e2' }));
    await smallAdapter.set('k3', makeEntry([0, 0, 1], { id: 'e3' }));

    const stats = await smallAdapter.getStats();
    expect(stats.totalEntries).toBe(2);
  });

});
