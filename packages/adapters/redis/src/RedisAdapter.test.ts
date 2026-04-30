import type { CacheEntry } from '@reaatech/llm-cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisAdapter } from './RedisAdapter.js';

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

describe('RedisAdapter', () => {
  let adapter: RedisAdapter;
  let mockClient: {
    isOpen: boolean;
    connect: ReturnType<typeof vi.fn>;
    quit: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    setEx: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
    exists: ReturnType<typeof vi.fn>;
    mGet: ReturnType<typeof vi.fn>;
    multi: ReturnType<typeof vi.fn>;
    scanIterator: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    ping: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockClient = {
      isOpen: false,
      connect: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      setEx: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      exists: vi.fn().mockResolvedValue(0),
      mGet: vi.fn().mockResolvedValue([]),
      multi: vi.fn().mockReturnValue({
        setEx: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
      }),
      scanIterator: vi.fn().mockReturnValue([]),
      info: vi.fn().mockResolvedValue('db0:keys=42,expires=10'),
      ping: vi.fn().mockResolvedValue('PONG'),
      on: vi.fn(),
    };

    adapter = new RedisAdapter({ url: 'redis://localhost:6379' });
    // biome-ignore lint/suspicious/noExplicitAny: test mock injection
    (adapter as any).client = mockClient as any;
  });

  it('should connect when not open', async () => {
    await adapter.connect();
    expect(mockClient.connect).toHaveBeenCalled();
  });

  it('should skip connect when already open', async () => {
    mockClient.isOpen = true;
    await adapter.connect();
    expect(mockClient.connect).not.toHaveBeenCalled();
  });

  it('should disconnect when open', async () => {
    mockClient.isOpen = true;
    await adapter.disconnect();
    expect(mockClient.quit).toHaveBeenCalled();
  });

  it('should get and deserialize an entry', async () => {
    const entry = makeEntry();
    mockClient.get.mockResolvedValueOnce(JSON.stringify(entry));
    const result = await adapter.get('key');
    expect(result).not.toBeNull();
    expect(result?.prompt).toBe('test');
    expect(result?.metadata.createdAt instanceof Date).toBe(true);
  });

  it('should return null for missing key', async () => {
    const result = await adapter.get('missing');
    expect(result).toBeNull();
  });

  it('should return null for expired entry', async () => {
    const entry = makeEntry({
      metadata: {
        createdAt: new Date(Date.now() - 7200_000),
        ttl: 3600,
        expiresAt: new Date(Date.now() - 3600_000),
        queryType: 'factual',
      },
    });
    mockClient.get.mockResolvedValueOnce(JSON.stringify(entry));
    const result = await adapter.get('key');
    expect(result).toBeNull();
  });

  it('should set with TTL', async () => {
    const entry = makeEntry();
    await adapter.set('key', entry);
    expect(mockClient.setEx).toHaveBeenCalled();
    const [, ttlSeconds] = mockClient.setEx.mock.calls[0];
    expect(ttlSeconds).toBeGreaterThan(0);
  });

  it('should delete expired entry when TTL is <= 0', async () => {
    const entry = makeEntry({
      metadata: {
        createdAt: new Date(),
        ttl: 0,
        expiresAt: new Date(Date.now() - 1000),
        queryType: 'factual',
      },
    });
    await adapter.set('key', entry);
    expect(mockClient.del).toHaveBeenCalled();
    expect(mockClient.setEx).not.toHaveBeenCalled();
  });

  it('should delete a key', async () => {
    const result = await adapter.delete('key');
    expect(result).toBe(true);
  });

  it('should check existence', async () => {
    mockClient.exists.mockResolvedValueOnce(1);
    const result = await adapter.exists('key');
    expect(result).toBe(true);
  });

  it('should batch get', async () => {
    const entry = makeEntry();
    mockClient.mGet.mockResolvedValueOnce([JSON.stringify(entry), null]);
    const results = await adapter.getBatch(['key1', 'key2']);
    expect(results).toHaveLength(2);
    expect(results[0]).not.toBeNull();
    expect(results[1]).toBeNull();
  });

  it('should batch set', async () => {
    const entry = makeEntry();
    await adapter.setBatch([
      { key: 'k1', entry },
      { key: 'k2', entry },
    ]);
    expect(mockClient.multi).toHaveBeenCalled();
  });

  it('should batch delete', async () => {
    mockClient.del.mockResolvedValueOnce(2);
    const count = await adapter.deleteBatch(['k1', 'k2']);
    expect(count).toBe(2);
  });

  it('should find by use case', async () => {
    const entry = makeEntry({ useCase: 'qa' });
    mockClient.scanIterator.mockReturnValue(['llm-cache:key1']);
    mockClient.get.mockResolvedValueOnce(JSON.stringify(entry));

    const results = await adapter.findByUseCase('qa');
    expect(results).toHaveLength(1);
    expect(results[0].useCase).toBe('qa');
  });

  it('should invalidate by criteria', async () => {
    const entry = makeEntry({ useCase: 'qa' });
    mockClient.scanIterator.mockReturnValue(['llm-cache:key1']);
    mockClient.get.mockResolvedValueOnce(JSON.stringify(entry));

    const count = await adapter.invalidateByCriteria({ useCase: 'qa' });
    expect(count).toBeGreaterThan(0);
  });

  it('should return stats', async () => {
    const stats = await adapter.getStats();
    expect(stats.totalEntries).toBe(42);
  });

  it('should report healthy on ping', async () => {
    const health = await adapter.healthCheck();
    expect(health.healthy).toBe(true);
  });

  it('should report unhealthy on ping failure', async () => {
    mockClient.ping.mockRejectedValueOnce(new Error('timeout'));
    const health = await adapter.healthCheck();
    expect(health.healthy).toBe(false);
  });
});
