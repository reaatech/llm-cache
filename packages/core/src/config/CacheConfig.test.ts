import { describe, expect, it } from 'vitest';
import { CacheConfigSchema } from './CacheConfig.js';

describe('CacheConfigSchema', () => {
  it('should parse a minimal valid config', () => {
    const result = CacheConfigSchema.parse({
      storage: { adapter: 'memory' },
      vectorStorage: { adapter: 'memory' },
      embedding: {
        provider: 'openai',
        model: 'text-embedding-3-small',
        dimensions: 1536,
        batchSize: 100,
        maxRetries: 3,
      },
      similarity: { threshold: 0.8, metric: 'cosine', maxResults: 10 },
      ttl: {
        default: 3600,
        factual: 1800,
        creative: 7200,
        analytical: 3600,
        sensitive: 600,
        byUseCase: {},
      },
      segmentation: { enabled: true, defaultUseCase: 'general' },
      cost: { enabled: true, currency: 'USD' },
      observability: { metrics: true, tracing: false, logging: 'info' },
    });

    expect(result.storage.adapter).toBe('memory');
    expect(result.vectorStorage.adapter).toBe('memory');
  });

  it('should apply defaults', () => {
    const result = CacheConfigSchema.parse({
      storage: { adapter: 'redis' },
      vectorStorage: { adapter: 'qdrant' },
      embedding: { provider: 'openai' },
      similarity: { metric: 'cosine' },
      ttl: { default: 3600 },
      segmentation: { enabled: true },
      cost: { enabled: true },
      observability: { metrics: true },
    });

    expect(result.embedding.model).toBe('text-embedding-3-small');
    expect(result.embedding.dimensions).toBe(1536);
    expect(result.embedding.batchSize).toBe(100);
    expect(result.embedding.maxRetries).toBe(3);
    expect(result.similarity.threshold).toBe(0.8);
    expect(result.similarity.metric).toBe('cosine');
    expect(result.similarity.maxResults).toBe(10);
    expect(result.ttl.default).toBe(3600);
    expect(result.ttl.factual).toBe(1800);
    expect(result.ttl.creative).toBe(7200);
    expect(result.ttl.analytical).toBe(3600);
    expect(result.ttl.sensitive).toBe(600);
    expect(result.segmentation.enabled).toBe(true);
    expect(result.segmentation.defaultUseCase).toBe('general');
    expect(result.cost.enabled).toBe(true);
    expect(result.cost.currency).toBe('USD');
    expect(result.observability.metrics).toBe(true);
    expect(result.observability.tracing).toBe(false);
    expect(result.observability.logging).toBe('info');
  });

  it('should accept a fully specified config', () => {
    const result = CacheConfigSchema.parse({
      storage: { adapter: 'dynamodb', options: { region: 'us-east-1' } },
      vectorStorage: { adapter: 'qdrant', options: { url: 'http://localhost:6333' } },
      embedding: {
        provider: 'openai',
        model: 'text-embedding-3-large',
        dimensions: 3072,
        batchSize: 50,
        maxRetries: 5,
      },
      similarity: { threshold: 0.9, metric: 'cosine', maxResults: 5 },
      ttl: {
        default: 7200,
        factual: 3600,
        creative: 14400,
        analytical: 7200,
        sensitive: 300,
        byUseCase: { summarization: 1800 },
      },
      segmentation: {
        enabled: true,
        defaultUseCase: 'qa',
        allowedUseCases: ['qa', 'summarization'],
      },
      cost: { enabled: true, currency: 'USD' },
      observability: { metrics: true, tracing: true, logging: 'debug' },
      security: {
        encryption: { enabled: true, algorithm: 'aes-256-gcm' },
        defaultSensitive: true,
      },
    });

    expect(result.embedding.model).toBe('text-embedding-3-large');
    expect(result.similarity.threshold).toBe(0.9);
    expect(result.observability.logging).toBe('debug');
    expect(result.security?.encryption?.enabled).toBe(true);
  });

  it('should reject invalid adapter values', () => {
    expect(() =>
      CacheConfigSchema.parse({
        storage: { adapter: 'postgres' },
        vectorStorage: { adapter: 'memory' },
      }),
    ).toThrow();
  });

  it('should reject invalid similarity threshold', () => {
    expect(() =>
      CacheConfigSchema.parse({
        storage: { adapter: 'memory' },
        vectorStorage: { adapter: 'memory' },
        similarity: { threshold: 1.5 },
      }),
    ).toThrow();
  });

  it('should reject invalid log level', () => {
    expect(() =>
      CacheConfigSchema.parse({
        storage: { adapter: 'memory' },
        vectorStorage: { adapter: 'memory' },
        observability: { logging: 'verbose' },
      }),
    ).toThrow();
  });
});
