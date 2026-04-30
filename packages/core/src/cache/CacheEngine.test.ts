import { beforeEach, describe, expect, it } from 'vitest';
import type { CacheConfig } from '../config/CacheConfig.js';
import type { EmbeddingProvider } from '../embedding/EmbeddingProvider.js';
import { InMemoryAdapter } from '../storage/InMemoryAdapter.js';
import { CacheEngine } from './CacheEngine.js';

class FakeEmbedder implements EmbeddingProvider {
  private dimension: number;

  constructor(dimension = 3) {
    this.dimension = dimension;
  }

  embed(): Promise<number[]> {
    return Promise.resolve(
      Array(this.dimension)
        .fill(0)
        .map(() => Math.random()),
    );
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(() => this.embed()));
  }
}

function createConfig(): CacheConfig {
  return {
    storage: { adapter: 'memory' },
    vectorStorage: { adapter: 'memory' },
    embedding: {
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 3,
      batchSize: 100,
      maxRetries: 3,
    },
    similarity: {
      threshold: 0.8,
      metric: 'cosine',
      maxResults: 10,
    },
    ttl: {
      default: 3600,
      factual: 1800,
      creative: 7200,
      analytical: 3600,
      sensitive: 600,
      byUseCase: {},
    },
    segmentation: {
      enabled: true,
      defaultUseCase: 'general',
    },
    cost: {
      enabled: true,
      currency: 'USD',
    },
    observability: {
      metrics: true,
      tracing: false,
      logging: 'info',
    },
  };
}

describe('CacheEngine', () => {
  let engine: CacheEngine;
  let storage: InMemoryAdapter;
  let vectorStorage: InMemoryAdapter;
  let embedder: FakeEmbedder;
  let config: CacheConfig;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    vectorStorage = new InMemoryAdapter();
    embedder = new FakeEmbedder(3);
    config = createConfig();

    engine = new CacheEngine({
      storage,
      vectorStorage,
      embedder,
      config,
    });
  });

  it('should return cache miss when empty', async () => {
    const result = await engine.get('hello world');
    expect(result.hit).toBe(false);
  });

  it('should return exact match after set', async () => {
    await engine.set(
      'hello world',
      { content: 'hi' },
      { model: 'gpt-4', modelVersion: 'gpt-4-0613' },
    );

    const result = await engine.get('hello world', { model: 'gpt-4', modelVersion: 'gpt-4-0613' });
    expect(result.hit).toBe(true);
    if (result.hit) {
      expect(result.type).toBe('exact');
    }
  });

  it('should respect generation config hash isolation', async () => {
    await engine.set(
      'hello world',
      { content: 'hi' },
      {
        model: 'gpt-4',
        modelVersion: 'gpt-4-0613',
        temperature: 0.5,
      },
    );

    // Same prompt, different temperature = different fingerprint = miss
    const result = await engine.get('hello world', {
      model: 'gpt-4',
      modelVersion: 'gpt-4-0613',
      temperature: 1.0,
    });
    expect(result.hit).toBe(false);
  });

  it('should invalidate by criteria', async () => {
    await engine.set(
      'hello world',
      { content: 'hi' },
      { model: 'gpt-4', modelVersion: 'gpt-4-0613' },
    );

    const result = await engine.invalidate({ useCase: 'general' });
    expect(result.total).toBeGreaterThan(0);
    expect(result.storage).toBeGreaterThan(0);
    expect(result.vectorStorage).toBeGreaterThan(0);

    const after = await engine.get('hello world', { model: 'gpt-4', modelVersion: 'gpt-4-0613' });
    expect(after.hit).toBe(false);
  });

  it('should return healthy status', async () => {
    const health = await engine.healthCheck();
    expect(health.storage).toBe(true);
    expect(health.vectorStorage).toBe(true);
  });

  it('should store response as unknown type', async () => {
    const complexResponse = {
      choices: [{ message: { content: 'hi', role: 'assistant' } }],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    };

    await engine.set('test prompt', complexResponse, {
      model: 'gpt-4',
      modelVersion: 'gpt-4-0613',
    });
    const result = await engine.get('test prompt', { model: 'gpt-4', modelVersion: 'gpt-4-0613' });

    expect(result.hit).toBe(true);
    if (result.hit) {
      expect(typeof result.entry.response).toBe('object');
      expect((result.entry.response as typeof complexResponse).choices[0].message.content).toBe(
        'hi',
      );
    }
  });

  it('should apply factual TTL', async () => {
    const entry = await engine.set(
      ' factual query',
      'answer',
      {
        model: 'gpt-4',
        modelVersion: 'gpt-4-0613',
      },
      { queryType: 'factual' },
    );

    expect(entry.metadata.ttl).toBe(1800);
  });

  it('should apply sensitive TTL', async () => {
    const entry = await engine.set(
      ' sensitive query',
      'answer',
      {
        model: 'gpt-4',
        modelVersion: 'gpt-4-0613',
      },
      { sensitive: true },
    );

    expect(entry.metadata.ttl).toBe(600);
  });

  it('should set generationConfigHash on entry', async () => {
    const entry = await engine.set('test', 'response', {
      model: 'gpt-4',
      modelVersion: 'gpt-4-0613',
      temperature: 0.7,
    });

    expect(entry.generationConfigHash).toBeDefined();
    expect(entry.generationConfigHash.length).toBe(64); // SHA-256 hex
  });

  it('should include embedding model metadata', async () => {
    const entry = await engine.set('test', 'response', {
      model: 'gpt-4',
      modelVersion: 'gpt-4-0613',
    });

    expect(entry.embeddingModel).toBe('text-embedding-3-small');
    expect(entry.embeddingDimensions).toBe(3);
  });

  it('should handle batch set and get operations via adapters', async () => {
    await engine.set('prompt1', 'response1', { model: 'gpt-4', modelVersion: 'gpt-4-0613' });
    await engine.set('prompt2', 'response2', { model: 'gpt-4', modelVersion: 'gpt-4-0613' });

    const result1 = await engine.get('prompt1', { model: 'gpt-4', modelVersion: 'gpt-4-0613' });
    const result2 = await engine.get('prompt2', { model: 'gpt-4', modelVersion: 'gpt-4-0613' });

    expect(result1.hit).toBe(true);
    expect(result2.hit).toBe(true);
  });

  it('should compute cost via injected costCalculator', async () => {
    const costCalc = {
      calculateCost: () => ({
        inputCost: 0.001,
        outputCost: 0.002,
        totalCost: 0.003,
        currency: 'USD',
      }),
    };
    const engineWithCost = new CacheEngine({
      storage: new InMemoryAdapter(),
      vectorStorage: new InMemoryAdapter(),
      embedder,
      config,
      costCalculator: costCalc,
    });
    const entry = await engineWithCost.set(
      'prompt',
      'response',
      { model: 'gpt-4', modelVersion: 'gpt-4-0613' },
      { tokens: { prompt: 100, completion: 200 } },
    );
    expect(entry.tokens.total).toBe(300);
    expect(entry.cost.total).toBeCloseTo(0.003);
  });
});
