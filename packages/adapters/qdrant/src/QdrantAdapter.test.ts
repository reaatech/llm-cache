import { describe, it, expect, vi, beforeEach } from 'vitest';
import { v5 as uuidv5 } from 'uuid';
import { QdrantAdapter } from './QdrantAdapter.js';
import type { CacheEntry } from '@llm-cache/core';

const KEY_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';
const pointId = (key: string) => uuidv5(key, KEY_NAMESPACE);

function makeEntry(overrides?: Partial<CacheEntry>): CacheEntry {
  const now = new Date();
  return {
    id: 'test-id',
    prompt: 'test',
    promptHash: 'hash',
    response: 'response',
    embedding: [0.1, 0.2, 0.3],
    model: 'gpt-4',
    modelVersion: 'gpt-4-0613',
    generationConfigHash: 'cfg',
    embeddingModel: 'text-embedding-3-small',
    embeddingDimensions: 3,
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

function payloadFromEntry(key: string, entry: CacheEntry): Record<string, unknown> {
  return {
    cacheKey: key,
    id: entry.id,
    prompt: entry.prompt,
    promptHash: entry.promptHash,
    response: JSON.stringify(entry.response),
    model: entry.model,
    modelVersion: entry.modelVersion,
    generationConfigHash: entry.generationConfigHash,
    embeddingModel: entry.embeddingModel,
    embeddingDimensions: entry.embeddingDimensions,
    useCase: entry.useCase,
    sensitive: entry.sensitive,
    tokens: entry.tokens,
    cost: entry.cost,
    createdAtMs: entry.metadata.createdAt.getTime(),
    expiresAtMs: entry.metadata.expiresAt.getTime(),
    metadata: {
      createdAt: entry.metadata.createdAt.toISOString(),
      ttl: entry.metadata.ttl,
      expiresAt: entry.metadata.expiresAt.toISOString(),
      queryType: entry.metadata.queryType,
    },
  };
}

describe('QdrantAdapter', () => {
  let adapter: QdrantAdapter;
  let mockClient: {
    getCollections: ReturnType<typeof vi.fn>;
    createCollection: ReturnType<typeof vi.fn>;
    createPayloadIndex: ReturnType<typeof vi.fn>;
    retrieve: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    scroll: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
    getCollection: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockClient = {
      getCollections: vi.fn().mockResolvedValue({ collections: [] }),
      createCollection: vi.fn().mockResolvedValue(undefined),
      createPayloadIndex: vi.fn().mockResolvedValue(undefined),
      retrieve: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      scroll: vi.fn().mockResolvedValue({ points: [] }),
      search: vi.fn().mockResolvedValue([]),
      getCollection: vi.fn().mockResolvedValue({ points_count: 10 }),
    };

    adapter = new QdrantAdapter({
      url: 'http://localhost:6333',
      collectionName: 'test-cache',
      vectorSize: 3,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).client = mockClient as any;
  });

  it('should be instantiable', () => {
    expect(adapter).toBeDefined();
  });

  it('should create collection on first connect', async () => {
    await adapter.connect();
    expect(mockClient.createCollection).toHaveBeenCalledWith('test-cache', {
      vectors: { size: 3, distance: 'Cosine' },
    });
    expect(mockClient.createPayloadIndex).toHaveBeenCalledTimes(5);
  });

  it('should skip create if collection exists', async () => {
    mockClient.getCollections.mockResolvedValueOnce({
      collections: [{ name: 'test-cache' }],
    });
    await adapter.connect();
    expect(mockClient.createCollection).not.toHaveBeenCalled();
  });

  it('should get an entry', async () => {
    const entry = makeEntry();
    mockClient.retrieve.mockResolvedValueOnce([
      {
        id: pointId('key'),
        payload: payloadFromEntry('key', entry),
        vector: entry.embedding,
      },
    ]);

    const result = await adapter.get('key');
    expect(result).not.toBeNull();
    expect(result!.prompt).toBe('test');
    expect(mockClient.retrieve).toHaveBeenCalledWith(
      'test-cache',
      expect.objectContaining({ ids: [pointId('key')] })
    );
  });

  it('should return null for missing key', async () => {
    const result = await adapter.get('missing');
    expect(result).toBeNull();
  });

  it('should set an entry using a deterministic UUID point id', async () => {
    const entry = makeEntry();
    await adapter.set('cache-key-with-colons:and:hashes', entry);
    expect(mockClient.upsert).toHaveBeenCalledWith('test-cache', {
      points: [
        {
          id: pointId('cache-key-with-colons:and:hashes'),
          vector: entry.embedding,
          payload: expect.objectContaining({ cacheKey: 'cache-key-with-colons:and:hashes' }),
        },
      ],
    });
  });

  it('should delete an entry by UUID point id', async () => {
    const result = await adapter.delete('key');
    expect(result).toBe(true);
    expect(mockClient.delete).toHaveBeenCalledWith('test-cache', { points: [pointId('key')] });
  });

  it('should find similar entries', async () => {
    const entry = makeEntry({ useCase: 'qa' });
    mockClient.search.mockResolvedValueOnce([
      {
        id: pointId('key'),
        score: 0.95,
        vector: entry.embedding,
        payload: payloadFromEntry('key', entry),
      },
    ]);

    const results = await adapter.findSimilar([1, 0, 0], 0.8, { useCase: 'qa' }, 10);
    expect(results).toHaveLength(1);
    expect(results[0].similarity).toBe(0.95);
    expect(results[0].entry.embedding).toEqual(entry.embedding);
  });

  it('should invalidate by criteria with pagination', async () => {
    mockClient.scroll
      .mockResolvedValueOnce({
        points: [{ id: pointId('k1') }, { id: pointId('k2') }],
        next_page_offset: 'cursor',
      })
      .mockResolvedValueOnce({
        points: [{ id: pointId('k3') }],
        next_page_offset: null,
      });

    const count = await adapter.invalidateByCriteria({ useCase: 'qa' });
    expect(count).toBe(3);
    expect(mockClient.delete).toHaveBeenCalledTimes(2);
  });

  it('should refuse to invalidate without criteria', async () => {
    const count = await adapter.invalidateByCriteria({});
    expect(count).toBe(0);
    expect(mockClient.scroll).not.toHaveBeenCalled();
  });

  it('should pass olderThan as a numeric range filter', async () => {
    mockClient.scroll.mockResolvedValueOnce({ points: [], next_page_offset: null });
    await adapter.invalidateByCriteria({ olderThan: new Date(1700_000_000_000) });
    const filter = mockClient.scroll.mock.calls[0][1].filter as { must: Array<{ range?: unknown }> };
    expect(filter.must.some((c) => c.range)).toBe(true);
  });

  it('should return stats', async () => {
    const stats = await adapter.getStats();
    expect(stats.totalEntries).toBe(10);
  });

  it('should report healthy when connected', async () => {
    const health = await adapter.healthCheck();
    expect(health.healthy).toBe(true);
  });

  it('should report not healthy when not connected', async () => {
    mockClient.getCollections.mockRejectedValueOnce(new Error('timeout'));
    const health = await adapter.healthCheck();
    expect(health.healthy).toBe(false);
  });
});
