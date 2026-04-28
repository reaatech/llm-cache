# Testing Agent Skills

## Overview

The Testing Agent is responsible for implementing comprehensive testing strategies for the llm-cache project. This includes unit tests, integration tests, load tests, and chaos engineering tests to ensure quality and reliability.

## Capabilities

### 1. Unit Testing

- Write comprehensive unit tests with Vitest
- Test all public APIs and edge cases
- Implement test doubles and mocking
- Achieve 90%+ code coverage

### 2. Integration Testing

- Test storage adapter integrations
- Test with real Redis and DynamoDB
- Test embedding provider integrations
- Test end-to-end cache flows

### 3. Load Testing

- Implement load tests with k6
- Test high-concurrency scenarios
- Test large cache sizes
- Measure performance benchmarks

### 4. Chaos Engineering

- Test failure scenarios
- Test network partitions
- Test storage failures
- Test recovery mechanisms

## Input/Output Specifications

### Input

- Code to be tested
- Testing requirements
- Performance requirements
- Quality standards

### Output

- Unit test suites
- Integration test suites
- Load test scripts
- Test reports and coverage

## Usage Examples

### Example 1: Unit Testing Cache Engine

**Request:**

```
Write unit tests for the CacheEngine with:
- Exact match cache hits
- Semantic match cache hits
- Cache misses
- TTL expiration
- Error handling
```

**Response:**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheEngine } from '../src/cache/CacheEngine';
import { StorageAdapter } from '../src/storage/StorageAdapter';
import { EmbeddingProvider } from '../src/embedding/EmbeddingProvider';

describe('CacheEngine', () => {
  let cacheEngine: CacheEngine;
  let mockStorage: StorageAdapter;
  let mockEmbedder: EmbeddingProvider;

  beforeEach(() => {
    mockStorage = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      findSimilar: vi.fn(),
      // ... other methods
    } as unknown as StorageAdapter;

    mockEmbedder = {
      embed: vi.fn(),
      embedBatch: vi.fn(),
    } as unknown as EmbeddingProvider;

    cacheEngine = new CacheEngine({
      storage: mockStorage,
      embedder: mockEmbedder,
      config: {
        similarity: { threshold: 0.8 },
        ttl: { default: 3600 },
      },
    });
  });

  it('should return exact match when prompt hash exists', async () => {
    const prompt = 'What is TypeScript?';
    const expectedEntry = createMockCacheEntry(prompt);

    vi.mocked(mockStorage.get).mockResolvedValue(expectedEntry);

    const result = await cacheEngine.get(prompt);

    expect(result.hit).toBe(true);
    expect(result.type).toBe('exact');
    expect(result.entry).toEqual(expectedEntry);
    expect(mockStorage.get).toHaveBeenCalledWith(expect.stringContaining('sha256:'));
  });

  it('should return semantic match when similarity > threshold', async () => {
    const prompt = 'Tell me about TypeScript';
    const embedding = [0.1, 0.2, 0.3]; // Mock embedding
    const similarEntry = createMockCacheEntry('What is TypeScript?', 0.85);

    vi.mocked(mockStorage.get).mockResolvedValue(null); // No exact match
    vi.mocked(mockEmbedder.embed).mockResolvedValue(embedding);
    vi.mocked(mockStorage.findSimilar).mockResolvedValue([similarEntry]);

    const result = await cacheEngine.get(prompt);

    expect(result.hit).toBe(true);
    expect(result.type).toBe('semantic');
    expect(result.confidence).toBe(0.85);
    expect(mockEmbedder.embed).toHaveBeenCalledWith(prompt);
    expect(mockStorage.findSimilar).toHaveBeenCalledWith(
      embedding,
      expect.any(String),
      expect.any(String),
      expect.any(Number)
    );
  });

  it('should return cache miss when no exact or semantic match', async () => {
    const prompt = 'What is Rust?';

    vi.mocked(mockStorage.get).mockResolvedValue(null);
    vi.mocked(mockEmbedder.embed).mockResolvedValue([0.1, 0.2, 0.3]);
    vi.mocked(mockStorage.findSimilar).mockResolvedValue([]);

    const result = await cacheEngine.get(prompt);

    expect(result.hit).toBe(false);
    expect(result.reason).toBe('not_found');
  });

  it('should not return expired cache entries', async () => {
    const prompt = 'What is TypeScript?';
    const expiredEntry = {
      ...createMockCacheEntry(prompt),
      metadata: {
        ...createMockCacheEntry(prompt).metadata,
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      },
    };

    vi.mocked(mockStorage.get).mockResolvedValue(expiredEntry);

    const result = await cacheEngine.get(prompt);

    expect(result.hit).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('should handle storage errors gracefully', async () => {
    const prompt = 'What is TypeScript?';

    vi.mocked(mockStorage.get).mockRejectedValue(new Error('Storage connection failed'));

    await expect(cacheEngine.get(prompt)).rejects.toThrow('Storage connection failed');
  });
});

function createMockCacheEntry(prompt: string, similarity?: number) {
  return {
    id: 'test-id',
    prompt,
    response: 'TypeScript is a typed superset of JavaScript.',
    embedding: [0.1, 0.2, 0.3],
    model: 'gpt-4',
    modelVersion: 'gpt-4-0613',
    useCase: 'qa',
    tokens: { prompt: 10, completion: 50, total: 60 },
    cost: { prompt: 0.0003, completion: 0.0006, total: 0.0009 },
    metadata: {
      createdAt: new Date(),
      ttl: 3600,
      expiresAt: new Date(Date.now() + 3600000),
      queryType: 'factual' as const,
      confidence: similarity,
    },
  };
}
```

### Example 2: Integration Testing with Redis

**Request:**

```
Write integration tests for Redis adapter with:
- Real Redis instance using testcontainers
- TTL verification
- Batch operations
- Concurrent access
```

**Response:**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RedisAdapter } from '../src/adapters/redis/RedisAdapter';
import { RedisContainer, StartedRedisContainer } from 'testcontainers/redis';

describe('RedisAdapter Integration', () => {
  let adapter: RedisAdapter;
  let redisContainer: StartedRedisContainer;

  beforeAll(async () => {
    redisContainer = await new RedisContainer().withImage('redis:7-alpine').start();

    const url = redisContainer.getConnectionUrl();
    adapter = new RedisAdapter({ url });
  });

  afterAll(async () => {
    await redisContainer.stop();
  });

  it('should store and retrieve cache entries', async () => {
    const entry = createTestCacheEntry();
    const key = 'test:key';

    await adapter.set(key, entry);
    const retrieved = await adapter.get(key);

    expect(retrieved).toEqual(entry);
  });

  it('should respect TTL settings', async () => {
    const entry = createTestCacheEntry(1); // 1 second TTL
    const key = 'test:ttl';

    await adapter.set(key, entry);

    // Should exist immediately
    expect(await adapter.get(key)).toEqual(entry);

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Should be expired
    expect(await adapter.get(key)).toBeNull();
  });

  it('should handle batch operations', async () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      ...createTestCacheEntry(),
      id: `batch-${i}`,
      prompt: `Test prompt ${i}`,
    }));

    await adapter.setBatch(entries);

    const keys = entries.map((e) => `test:${e.id}`);
    const retrieved = await adapter.getBatch(keys);

    expect(retrieved).toHaveLength(10);
    expect(retrieved.every((e) => e !== null)).toBe(true);
  });

  it('should handle concurrent access', async () => {
    const key = 'test:concurrent';
    const entry = createTestCacheEntry();

    // Perform 100 concurrent writes
    await Promise.all(Array.from({ length: 100 }, () => adapter.set(key, entry)));

    const retrieved = await adapter.get(key);
    expect(retrieved).toEqual(entry);
  });

  it('should find similar entries', async () => {
    const embedding = [0.1, 0.2, 0.3];
    const entries = [
      { ...createTestCacheEntry(), embedding: [0.1, 0.2, 0.35] }, // Similar
      { ...createTestCacheEntry(), embedding: [0.9, 0.8, 0.7] }, // Not similar
    ];

    await adapter.setBatch(entries);

    const similar = await adapter.findSimilar(embedding, 0.8, 10);

    expect(similar).toHaveLength(1);
    expect(similar[0].similarity).toBeGreaterThan(0.8);
  });
});
```

### Example 3: Load Testing with k6

**Request:**

```
Write a k6 load test for the cache engine with:
- Ramp-up to 100 concurrent users
- Test cache hit and miss scenarios
- Measure latency percentiles
- Validate performance targets
```

**Response:**

```typescript
// load-tests/cache-performance.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const cacheHitRate = new Rate('cache_hit_rate');
const errorRate = new Rate('error_rate');

export const options = {
  stages: [
    { duration: '30s', target: 50 }, // Ramp to 50 users
    { duration: '1m', target: 50 }, // Stay at 50 users
    { duration: '30s', target: 100 }, // Ramp to 100 users
    { duration: '1m', target: 100 }, // Stay at 100 users
    { duration: '30s', target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<50'], // 95% of requests should be below 50ms
    cache_hit_rate: ['rate>0.6'], // At least 60% cache hit rate
    error_rate: ['rate<0.01'], // Less than 1% error rate
  },
};

const BASE_URL = 'http://localhost:3000';

export default function () {
  // Test cache hit scenario
  const hitPayload = JSON.stringify({
    prompt: 'What is TypeScript?',
    useCase: 'qa',
    model: 'gpt-4',
  });

  const hitRes = http.post(`${BASE_URL}/cache/get`, hitPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  const hitSuccess = check(hitRes, {
    'cache hit: status is 200': (r) => r.status === 200,
    'cache hit: response has hit=true': (r) => {
      const body = r.json();
      return body.hit === true;
    },
    'cache hit: latency < 10ms': (r) => r.timings.duration < 10,
  });

  cacheHitRate.add(hitSuccess);
  errorRate.add(hitRes.status >= 400);

  sleep(0.5);

  // Test cache miss scenario
  const missPayload = JSON.stringify({
    prompt: `What is the meaning of life? (random: ${Math.random()})`,
    useCase: 'qa',
    model: 'gpt-4',
  });

  const missRes = http.post(`${BASE_URL}/cache/get`, missPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(missRes, {
    'cache miss: status is 200': (r) => r.status === 200,
    'cache miss: response has hit=false': (r) => {
      const body = r.json();
      return body.hit === false;
    },
  });

  sleep(0.5);
}
```

## Best Practices

### 1. Test Structure

- Follow AAA pattern (Arrange, Act, Assert)
- Use descriptive test names
- Keep tests independent and isolated
- Clean up after tests

### 2. Test Coverage

- Test happy paths and edge cases
- Test error scenarios
- Test boundary conditions
- Test concurrent access

### 3. Test Performance

- Mock external dependencies
- Use test containers for integration tests
- Run tests in parallel when possible
- Measure and track test execution time

### 4. Test Maintenance

- Keep tests simple and readable
- Use test utilities and helpers
- Document test assumptions
- Review and refactor tests regularly

## Constraints

### Technical Constraints

- Must use Vitest for unit tests
- Must use testcontainers for integration tests
- Must use k6 for load tests
- Must follow project ESLint rules

### Quality Constraints

- Unit test coverage: 90%+ for core, 85%+ for adapters
- Integration tests: All storage adapters (including vector database)
- Load tests: Meet performance targets
- All tests must pass in CI

## Integration Points

### With Architect Agent

- Review testability of designs
- Define test scenarios
- Validate test coverage

### With Core Agent

- Test core functionality
- Validate API contracts
- Test error handling

### With Storage Agent

- Test storage integrations
- Validate data persistence
- Test connection handling

### With DevOps Agent

- Integrate tests into CI/CD
- Set up test environments
- Configure test reporting

## Quality Metrics

- **Unit Test Coverage**: 90%+ for core, 85%+ for adapters
- **Integration Test Coverage**: 100% of storage adapters (including vector database)
- **Load Test Performance**: Meet all latency targets
- **Vector Search Performance**: Semantic search returns results within 50ms for 100K+ entries
- **Embedding Dimension Mismatch**: Test that changing embedding model triggers cache miss
- **Test Execution Time**: < 5 minutes for full suite

## Tools and Resources

- **Unit Testing**: Vitest, @vitest/coverage-v8
- **Integration Testing**: Testcontainers, Docker
- **Load Testing**: k6, Artillery
- **Code Quality**: ESLint, Prettier
- **CI/CD**: GitHub Actions, Jenkins

---

**Skill Version**: 1.0.0  
**Last Updated**: 2026-04-22  
**Maintained by**: reiatech
