import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DynamoDBAdapter } from './DynamoDBAdapter.js';
import type { CacheEntry } from '@llm-cache/core';

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

function itemFromEntry(pk: string, entry: CacheEntry): Record<string, unknown> {
  return {
    pk,
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
    expiresAtEpoch: Math.floor(entry.metadata.expiresAt.getTime() / 1000),
    metadata: {
      createdAt: entry.metadata.createdAt.toISOString(),
      ttl: entry.metadata.ttl,
      expiresAt: entry.metadata.expiresAt.toISOString(),
      queryType: entry.metadata.queryType,
    },
  };
}

describe('DynamoDBAdapter', () => {
  let adapter: DynamoDBAdapter;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSend = vi.fn().mockResolvedValue({});

    adapter = new DynamoDBAdapter({ region: 'us-east-1', tableName: 'test' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).client = { send: mockSend } as any;
  });

  it('should be instantiable', () => {
    expect(adapter).toBeDefined();
  });

  it('should get an entry', async () => {
    const entry = makeEntry();
    mockSend.mockResolvedValueOnce({ Item: itemFromEntry('key', entry) });
    const result = await adapter.get('key');
    expect(result).not.toBeNull();
    expect(result!.prompt).toBe('test');
    expect(result!.id).toBe('test-id');
  });

  it('should return null for missing key', async () => {
    mockSend.mockResolvedValueOnce({});
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
    mockSend.mockResolvedValueOnce({ Item: itemFromEntry('key', entry) });
    const result = await adapter.get('key');
    expect(result).toBeNull();
  });

  it('should set an entry with id and native ttl epoch', async () => {
    const entry = makeEntry();
    await adapter.set('key', entry);
    expect(mockSend).toHaveBeenCalled();
    const command = mockSend.mock.calls[0][0];
    expect(command.input.TableName).toBe('test');
    expect(command.input.Item.pk).toBe('key');
    expect(command.input.Item.id).toBe(entry.id);
    expect(command.input.Item.expiresAtEpoch).toBe(
      Math.floor(entry.metadata.expiresAt.getTime() / 1000)
    );
  });

  it('should respect a custom ttl attribute name', async () => {
    const customAdapter = new DynamoDBAdapter({
      region: 'us-east-1',
      tableName: 'test',
      ttlAttribute: 'ttl',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (customAdapter as any).client = { send: mockSend } as any;
    const entry = makeEntry();
    await customAdapter.set('key', entry);
    const command = mockSend.mock.calls[0][0];
    expect(command.input.Item.ttl).toBe(
      Math.floor(entry.metadata.expiresAt.getTime() / 1000)
    );
  });

  it('should delete a key', async () => {
    await adapter.delete('key');
    expect(mockSend).toHaveBeenCalled();
    const command = mockSend.mock.calls[0][0];
    expect(command.input.TableName).toBe('test');
    expect(command.input.Key.pk).toBe('key');
  });

  it('should batch get', async () => {
    const entry = makeEntry();
    mockSend.mockResolvedValueOnce({
      Responses: { test: [itemFromEntry('key1', entry)] },
    });

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
    expect(mockSend).toHaveBeenCalled();
  });

  it('should batch delete', async () => {
    const count = await adapter.deleteBatch(['k1', 'k2']);
    expect(count).toBe(2);
    expect(mockSend).toHaveBeenCalled();
  });

  it('should find by use case via GSI', async () => {
    const entry = makeEntry({ useCase: 'qa' });
    mockSend.mockResolvedValueOnce({ Items: [itemFromEntry('key1', entry)] });

    const results = await adapter.findByUseCase('qa');
    expect(results).toHaveLength(1);
    expect(results[0].useCase).toBe('qa');
  });

  it('should invalidate by use case across paginated GSI results', async () => {
    const entry = makeEntry({ useCase: 'qa' });
    mockSend
      .mockResolvedValueOnce({
        Items: [itemFromEntry('key1', entry)],
        LastEvaluatedKey: { pk: 'key1' },
      })
      .mockResolvedValueOnce({}) // delete key1
      .mockResolvedValueOnce({
        Items: [itemFromEntry('key2', entry)],
      })
      .mockResolvedValueOnce({}); // delete key2

    const count = await adapter.invalidateByCriteria({ useCase: 'qa' });
    expect(count).toBe(2);
  });

  it('should report healthy on scan', async () => {
    mockSend.mockResolvedValueOnce({});
    const health = await adapter.healthCheck();
    expect(health.healthy).toBe(true);
  });

  it('should report not healthy on scan failure', async () => {
    mockSend.mockRejectedValueOnce(new Error('timeout'));
    const health = await adapter.healthCheck();
    expect(health.healthy).toBe(false);
  });
});
