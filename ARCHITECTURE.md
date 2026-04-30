# LLM Cache - Technical Architecture

## System Overview

llm-cache is a sophisticated semantic caching layer designed to reduce LLM API costs and latency through intelligent embedding-based caching. The system architecture follows a modular, enterprise-grade design with clear separation of concerns.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Application                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Cache Engine Layer                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              Cache Lookup Orchestrator                      │ │
│  │  1. Hash Check → 2. Exact Match → 3. Semantic Search       │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              Embedding Service                              │ │
│  │  • OpenAI Integration  • Batch Processing  • Caching       │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              Similarity Matcher                             │ │
│  │  • Cosine Similarity  • Threshold Filtering  • Ranking     │ │
│  └────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Storage Adapter Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  │   Memory     │  │    Redis     │  │   DynamoDB   │  │    Qdrant    │
│  │   Adapter    │  │   Adapter    │  │   Adapter    │  │   Adapter    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Cross-Cutting Concerns                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │    Cost      │  │ Observability│  │  Resilience  │          │
│  │   Tracker    │  │   Service    │  │   Manager    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Cache Engine (`@reaatech/llm-cache`)

The heart of the system, responsible for orchestrating cache operations.

#### CacheEngine

```typescript
class CacheEngine {
  private storage: StorageAdapter;
  private embedder: EmbeddingProvider;
  private matcher: SimilarityMatcher;
  private config: CacheConfig;

  async get(prompt: string, options?: CacheOptions): Promise<CacheResult>;
  async set(prompt: string, response: string, metadata?: CacheMetadata): Promise<void>;
  async invalidate(criteria: InvalidationCriteria): Promise<number>;
  async warm(prompts: string[]): Promise<void>;
}
```

**Responsibilities:**

- Multi-stage cache lookup (exact → semantic)
- Cache entry management
- TTL enforcement
- Model version tracking
- Use case segmentation

#### SimilarityMatcher

```typescript
class SimilarityMatcher {
  async findSimilar(
    embedding: number[],
    useCase: string,
    modelVersion: string,
    limit?: number
  ): Promise<SimilarityResult[]>;

  private calculateCosineSimilarity(a: number[], b: number[]): number;
  private applyThreshold(results: SimilarityResult[], threshold: number): SimilarityResult[];
}
```

**Responsibilities:**

- Vector similarity calculations
- Threshold-based filtering
- Result ranking and scoring
- Use case and model filtering

### 2. Embedding Service (`@reaatech/llm-cache/embedding`)

Handles all embedding-related operations with cost optimization.

#### OpenAIEmbedder

```typescript
class OpenAIEmbedder implements EmbeddingProvider {
  private apiKey: string;
  private model: string;
  private dimensions: number;
  // Note: EmbeddingCache and BatchQueue are inlined in the current implementation.
  // A standalone EmbeddingCache class is planned for a future release.

  async embed(text: string): Promise<number[]>;
  async embedBatch(texts: string[]): Promise<number[][]>;
  private getCachedEmbedding(text: string): Promise<number[] | null>;
}
```

**Features:**

- Automatic embedding caching to reduce API costs
- Batch processing for efficiency
- Rate limiting and retry logic
- Fallback mechanisms

#### EmbeddingCache *(planned for future release — currently inlined in OpenAIEmbedder)*

```typescript
class EmbeddingCache {
  private storage: Map<string, CachedEmbedding>;
  private ttl: number;

  async get(hash: string): Promise<number[] | null>;
  async set(hash: string, embedding: number[]): Promise<void>;
  private cleanup(): void;
}
```

### 3. Storage Adapters (`@reaatech/llm-cache-adapters/*`)

Abstract storage layer with multiple implementations.

#### StorageAdapter Interface

```typescript
interface StorageAdapter {
  // Core Operations
  get(key: string): Promise<CacheEntry | null>;
  set(key: string, entry: CacheEntry): Promise<void>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;

  // Batch Operations
  getBatch(keys: string[]): Promise<(CacheEntry | null)[]>;
  setBatch(entries: CacheEntry[]): Promise<void>;
  deleteBatch(keys: string[]): Promise<number>;

  // Metadata Queries
  findByUseCase(useCase: string, limit?: number): Promise<CacheEntry[]>;
  findByModelVersion(modelVersion: string, limit?: number): Promise<CacheEntry[]>;

  // Management
  invalidateByCriteria(criteria: InvalidationCriteria): Promise<number>;
  getStats(): Promise<StorageStats>;
  healthCheck(): Promise<HealthStatus>;
}

interface VectorStorageAdapter extends StorageAdapter {
  // Vector Search Operations
  findSimilar(
    embedding: number[],
    threshold: number,
    filters: VectorSearchFilters,
    limit?: number
  ): Promise<SimilarityResult[]>;
}

interface VectorSearchFilters {
  useCase?: string;
  modelVersion?: string;
  generationConfigHash?: string;
  embeddingModel?: string;
  embeddingDimensions?: number;
}
```

#### RedisAdapter

```typescript
class RedisAdapter implements StorageAdapter {
  private client: RedisClientType;
  private keyPrefix: string;

  // Planned for future release: distributed locking, Pub/Sub invalidation,
  // Lua scripts, and Redis Stack vector search support.
}
```

**Key Features:**

- Exact-match metadata storage with sub-millisecond latency
- Automatic TTL via `SETEX`
- Connection pooling and reconnection strategy
- Planned: Pub/Sub for cache invalidation (future release)
- Planned: Lua scripts for atomic operations (future release)
- Planned: Redis Stack (RediSearch) vector search support (future release)

#### DynamoDBAdapter

```typescript
class DynamoDBAdapter implements StorageAdapter {
  private client: DynamoDBDocumentClient;
  private rawClient: DynamoDBClient;
  private tableName: string;

  // Uses DynamoDB with GSI for metadata querying (gsi1 by useCase, gsi2 by modelVersion)
  // Implements batch operations with BatchWriteCommand (chunked at 25 items)
  // Writes native TTL epoch attribute for automatic row expiration
  // Planned: TransactWriteItems for atomic multi-row operations (future release)
  // Planned: DynamoDB Streams for invalidation propagation (future release)
  // NOTE: DynamoDB does not support vector similarity search natively.
  // Semantic search requires QdrantAdapter.
}
```

**Table Schema:**

```typescript
{
  PK: string; // Partition Key: useCase#generationConfigHash#promptHash
  SK: string; // Sort Key: timestamp
  GSI1PK: string; // GSI1: useCase (for use case queries)
  GSI1SK: string; // GSI1SK: modelVersion#generationConfigHash
  GSI2PK: string; // GSI2: modelVersion (for model queries)
  GSI2SK: string; // GSI2SK: useCase#createdAt
  embeddingId: string; // Reference to vector in external vector database
  // Prompts and responses stored encrypted if sensitive=true
  // ... other attributes
}
```

#### InMemoryAdapter

```typescript
class InMemoryAdapter implements StorageAdapter {
  private cache: LRUCache<string, CacheEntry>;
  private indices: Map<string, Set<string>>;
  private ttlManager: TTLManager;

  // LRU eviction with TTL support
  // In-memory indices for fast lookups
  // Background cleanup for expired entries
}
```

### 4. Cost Tracker (`@reaatech/llm-cache-cost-tracker`)

Comprehensive cost tracking and savings calculation.

#### CostCalculator

```typescript
class CostCalculator {
  private pricingDB: ModelPricingDatabase;

  calculateCost(model: string, promptTokens: number, completionTokens: number): CostBreakdown;

  calculateSavings(cacheHit: CacheHit, originalCost: number): SavingsReport;
}
```

#### ModelPricingDatabase

```typescript
class ModelPricingDatabase {
  private pricing: Map<string, ModelPricing>;

  // Supports 250+ models with dynamic pricing updates
  // Includes input/output pricing tiers
  // Handles currency conversion
}
```

**Pricing Data Structure:**

```typescript
interface ModelPricing {
  modelId: string;
  inputPricing: {
    per1KTokens: number;
    tiers?: PricingTier[];
  };
  outputPricing: {
    per1KTokens: number;
    tiers?: PricingTier[];
  };
  currency: string;
  lastUpdated: Date;
}
```

### 5. Observability Service (`@reaatech/llm-cache-observability`)

Enterprise-grade monitoring and logging.

#### MetricsCollector

```typescript
class MetricsCollector {
  private registry: MetricRegistry;
  private exporters: MetricExporter[];

  recordCacheHit(type: 'exact' | 'semantic'): void;
  recordCacheMiss(): void;
  recordLatency(operation: string, duration: number): void;
  recordCostSavings(amount: number): void;
  recordError(error: Error, context: ErrorContext): void;
}
```

**Key Metrics:**

- Cache hit rate (by type)
- Average response time (p50, p95, p99)
- Cost savings (hourly/daily/monthly)
- Storage utilization
- Error rates by operation
- Model version distribution

#### DistributedTracing *(planned for future release)*

```typescript
class DistributedTracing {
  private tracer: Tracer;
  private propagator: TextMapPropagator;

  startSpan(name: string, context?: Context): Span;
  injectContext(headers: Record<string, string>): void;
  extractContext(headers: Record<string, string>): Context;
}
```

### 6. CacheFingerprint & Generation Config Hashing

A `CacheFingerprint` is a SHA-256 hash of the full generation configuration, ensuring that two identical prompts with different generation parameters never share a cache entry.

**Fingerprint Input:**

```typescript
interface GenerationConfig {
  model: string;
  modelVersion: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  systemPrompt?: string;
  tools?: ToolDefinition[];
  responseFormat?: 'text' | 'json_object' | 'json_schema';
}
```

**Usage:**

- Exact-match keys include `generationConfigHash` to guarantee config isolation.
- Semantic search filters by `generationConfigHash` to prevent cross-config pollution.
- Model rotation invalidation targets all entries with the old `generationConfigHash`.

---

## Data Flow

### Cache Hit Flow

```
1. Client Request
   └─> prompt: "What is TypeScript?"
   └─> options: { useCase: "qa", model: "gpt-4" }

2. Cache Engine Processing
   └─> Generate prompt hash (SHA-256)
   └─> Check exact match in storage
       ├─> HIT: Return cached response with cache: exact
       └─> MISS: Continue to semantic search

3. Semantic Search
   └─> Generate embedding for prompt
   └─> Search for similar embeddings in storage
   └─> Filter by threshold (default: 0.8)
   └─> Filter by useCase and modelVersion
   └─> Return best match if similarity > threshold
       ├─> HIT: Return cached response with cache: semantic
       └─> MISS: Continue to LLM call

4. LLM Call & Cache Storage
   └─> Call LLM API
   └─> Generate embedding for prompt
   └─> Store in cache with metadata
   └─> Return response to client
```

### Cache Invalidation Flow

```
1. Model Version Change
   └─> Detect model rotation (e.g., gpt-4 → gpt-4-turbo)
   └─> Mark old entries as stale
   └─> Optional: Delete old entries immediately
   └─> Update model version in config

2. TTL Expiration
   └─> Background cleanup process
   └─> Scan for expired entries
   └─> Delete or archive expired entries
   └─> Update storage statistics

3. Manual Invalidation
   └─> Invalidate by useCase
   └─> Invalidate by modelVersion
   └─> Invalidate by age
   └─> Invalidate by custom criteria
```

## Configuration Management

### Hierarchical Configuration

```typescript
interface CacheConfig {
  // Storage Configuration
  storage: {
    adapter: 'memory' | 'redis' | 'dynamodb';
    options: RedisOptions | DynamoDBOptions | MemoryOptions;
  };

  // Embedding Configuration
  embedding: {
    provider: 'openai';
    model: string;
    dimensions: number;
    batchSize: number;
    maxRetries: number;
  };

  // Similarity Configuration
  similarity: {
    threshold: number;
    metric: 'cosine';
    maxResults: number;
  };

  // TTL Configuration
  ttl: {
    default: number;
    byQueryType: {
      factual: number;
      creative: number;
      analytical: number;
    };
    byUseCase: Record<string, number>;
  };

  // Segmentation Configuration
  segmentation: {
    enabled: boolean;
    defaultUseCase: string;
    allowedUseCases: string[];
  };

  // Cost Tracking Configuration
  cost: {
    enabled: boolean;
    currency: string;
    reportInterval: number;
  };

  // Observability Configuration
  observability: {
    metrics: {
      enabled: boolean;
      exporter: 'prometheus' | 'datadog' | 'cloudwatch';
    };
    tracing: {
      enabled: boolean;
      provider: 'jaeger' | 'zipkin' | 'datadog';
    };
    logging: {
      level: 'error' | 'warn' | 'info' | 'debug';
      format: 'json' | 'text';
    };
  };

  // Resilience Configuration
  resilience: {
    circuitBreaker: {
      enabled: boolean;
      threshold: number;
      timeout: number;
    };
    retry: {
      enabled: boolean;
      maxAttempts: number;
      backoff: 'exponential' | 'linear';
    };
  };
}
```

### Environment Variable Overrides

```bash
# Storage
LLM_CACHE_STORAGE_ADAPTER=redis
LLM_CACHE_STORAGE_REDIS_URL=redis://localhost:6379

# Embedding
LLM_CACHE_EMBEDDING_MODEL=text-embedding-3-small
LLM_CACHE_EMBEDDING_DIMENSIONS=1536

# Similarity
LLM_CACHE_SIMILARITY_THRESHOLD=0.8

# TTL
LLM_CACHE_TTL_DEFAULT=3600
LLM_CACHE_TTL_FACTUAL=1800
LLM_CACHE_TTL_CREATIVE=7200

# Cost
LLM_CACHE_COST_ENABLED=true
LLM_CACHE_COST_CURRENCY=USD

# Observability
LLM_CACHE_OBSERVABILITY_METRICS_ENABLED=true
LLM_CACHE_OBSERVABILITY_TRACING_ENABLED=false
```

## Performance Optimizations

### 1. Multi-Level Caching

```typescript
class MultiLevelCache {
  private L1: InMemoryCache; // Hot data (frequently accessed)
  private L2: StorageAdapter; // Warm data (occasionally accessed)
  private L3: EmbeddingCache; // Embedding cache (expensive to generate)

  async get(key: string): Promise<CacheEntry | null> {
    // Check L1 first (fastest)
    let entry = await this.L1.get(key);
    if (entry) return entry;

    // Check L2 (slower but persistent)
    entry = await this.L2.get(key);
    if (entry) {
      // Promote to L1
      await this.L1.set(key, entry);
      return entry;
    }

    return null;
  }
}
```

### 2. Batch Operations

```typescript
class BatchProcessor {
  private queue: OperationQueue;
  private batchSize: number;
  private flushInterval: number;

  async enqueue(operation: CacheOperation): Promise<void> {
    this.queue.add(operation);

    if (this.queue.size >= this.batchSize) {
      await this.flush();
    }
  }

  private async flush(): Promise<void> {
    const operations = this.queue.drain();
    await this.processBatch(operations);
  }
}
```

### 3. Connection Pooling

```typescript
class ConnectionPool<T> {
  private available: T[] = [];
  private inUse: Set<T> = new Set();
  private maxSize: number;

  async acquire(): Promise<T> {
    if (this.available.length > 0) {
      const connection = this.available.pop();
      this.inUse.add(connection);
      return connection;
    }

    if (this.inUse.size < this.maxSize) {
      const connection = await this.create();
      this.inUse.add(connection);
      return connection;
    }

    // Wait for available connection
    return new Promise((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(connection: T): void {
    this.inUse.delete(connection);

    if (this.waitQueue.length > 0) {
      const resolve = this.waitQueue.shift();
      resolve(connection);
    } else {
      this.available.push(connection);
    }
  }
}
```

## Security Architecture

### 1. Data Privacy & Encryption at Rest

Because cached prompts may contain PII, proprietary code, or sensitive business data, encryption at rest is supported at the storage adapter level.

```typescript
interface EncryptionConfig {
  enabled: boolean;
  algorithm: 'aes-256-gcm';
  keyProvider: () => Promise<CryptoKey>;
  encryptFields: ('prompt' | 'response' | 'embedding')[];
}
```

**Design Principles:**

- Exact-match lookups use the **prompt hash**, so the storage adapter can find entries without decrypting the prompt.
- Only `prompt`, `response`, and optionally `embedding` are encrypted. Metadata (useCase, modelVersion, timestamps, hashes) remains plaintext for querying.
- The `sensitive: boolean` flag on `CacheEntry` triggers encryption and a shorter default TTL.

### 2. GDPR / CCPA Compliance

- **Right to be forgotten**: `invalidateByCriteria` supports deleting all entries by `userId`, `useCase`, or prompt hash pattern.
- **Data retention**: Adaptive TTL ensures sensitive data expires faster.
- **Audit trail**: All cache operations are logged (without logging full prompts at `info` level).

### 3. Authentication & Authorization

```typescript
interface AuthContext {
  userId: string;
  permissions: string[];
  rateLimit: RateLimitConfig;
}

class AuthMiddleware {
  async validate(token: string): Promise<AuthContext>;
  async checkPermission(context: AuthContext, permission: string): Promise<boolean>;
}
```

### 4. Data Encryption

```typescript
class EncryptionService {
  private key: CryptoKey;

  async encrypt(data: string): Promise<string>;
  async decrypt(encrypted: string): Promise<string>;

  // Uses AES-256-GCM for encryption
  // Key rotation support
}
```

### 5. Audit Logging

```typescript
class AuditLogger {
  async log(operation: string, details: AuditDetails): Promise<void> {
    // Log all cache operations for compliance
    // Include user ID, timestamp, IP address
    // Immutable audit trail
  }
}
```

## Distribution Model

**Primary Distribution: npm Library**

llm-cache is primarily distributed as a set of npm packages (`@reaatech/llm-cache`, `@reaatech/llm-cache-adapters-redis`, etc.) that developers import into their applications. This provides the tightest integration with existing LLM client code and the lowest latency (no network hop to a separate service).

**Optional for Users, Required to Develop: HTTP Service Wrapper**

A thin HTTP wrapper is provided as `@reaatech/llm-cache-server`. Users can choose to import `@reaatech/llm-cache` directly into their application (lowest latency, tightest integration) OR deploy `@reaatech/llm-cache-server` as a sidecar/centralized service (polyglot environments, service-oriented architectures).

The server package is **optional for end users** but is a **required workspace package to develop and maintain** — it must be built, tested, and released in lockstep with core releases.

The Docker, Kubernetes, and Helm configurations described below apply to the `@reaatech/llm-cache-server` service wrapper.

---

## Deployment Patterns

### 1. Single Region Deployment

```yaml
# docker-compose.yml
version: '3.8'
services:
  llm-cache:
    image: reiatech/llm-cache:latest
    environment:
      - STORAGE_ADAPTER=redis
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

### 2. Multi-Region Deployment

```yaml
# k8s deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: llm-cache
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: llm-cache
          image: reiatech/llm-cache:latest
          env:
            - name: STORAGE_ADAPTER
              value: 'dynamodb'
            - name: DYNAMODB_TABLE
              value: 'llm-cache-global'
            - name: REGION
              valueFrom:
                fieldRef:
                  fieldPath: metadata.annotations['topology.kubernetes.io/zone']
```

### 3. Hybrid Deployment

```typescript
// Smart routing based on use case
class HybridStorageRouter {
  private hotStorage: RedisAdapter; // Low latency
  private coldStorage: DynamoDBAdapter; // High capacity

  async route(entry: CacheEntry): Promise<void> {
    if (entry.metadata.queryType === 'factual') {
      // Factual queries need low latency
      await this.hotStorage.set(entry.id, entry);
    } else {
      // Creative queries can tolerate higher latency
      await this.coldStorage.set(entry.id, entry);
    }
  }
}
```

## Monitoring Dashboard

### Grafana Dashboard Configuration

```json
{
  "dashboard": {
    "title": "LLM Cache Monitoring",
    "panels": [
      {
        "title": "Cache Hit Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(llm_cache_hits_total[5m]) / rate(llm_cache_requests_total[5m])"
          }
        ]
      },
      {
        "title": "Response Time (p99)",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.99, rate(llm_cache_duration_seconds_bucket[5m]))"
          }
        ]
      },
      {
        "title": "Cost Savings",
        "type": "stat",
        "targets": [
          {
            "expr": "sum(llm_cache_cost_savings_total)"
          }
        ]
      }
    ]
  }
}
```

## Testing Strategy

### 1. Unit Tests

```typescript
describe('CacheEngine', () => {
  it('should return exact match when prompt hash exists', async () => {
    const engine = new CacheEngine(mockStorage, mockEmbedder);
    const result = await engine.get('test prompt');

    expect(result.hit).toBe(true);
    expect(result.type).toBe('exact');
  });

  it('should return semantic match when similarity > threshold', async () => {
    const engine = new CacheEngine(mockStorage, mockEmbedder);
    const result = await engine.get('similar prompt');

    expect(result.hit).toBe(true);
    expect(result.type).toBe('semantic');
    expect(result.similarity).toBeGreaterThan(0.8);
  });
});
```

### 2. Integration Tests

```typescript
describe('RedisAdapter Integration', () => {
  let adapter: RedisAdapter;
  let redisContainer: StartedTestContainer;

  beforeAll(async () => {
    redisContainer = await new RedisContainer().start();
    adapter = new RedisAdapter({ url: redisContainer.getConnectionUrl() });
  });

  afterAll(async () => {
    await redisContainer.stop();
  });

  it('should store and retrieve cache entries', async () => {
    const entry = createTestEntry();
    await adapter.set('test-key', entry);

    const retrieved = await adapter.get('test-key');
    expect(retrieved).toEqual(entry);
  });
});
```

### 3. Load Tests

```typescript
// k6 load test
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 200 },
    { duration: '1m', target: 200 },
  ],
};

export default function () {
  const payload = JSON.stringify({
    prompt: 'What is TypeScript?',
    useCase: 'qa',
    model: 'gpt-4',
  });

  const res = http.post('http://localhost:3000/cache/get', payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 50ms': (r) => r.timings.duration < 50,
  });

  sleep(1);
}
```

## Error Handling

### Circuit Breaker Pattern *(planned for future release)*

```typescript
class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount = 0;
  private threshold: number;
  private timeout: number;

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      throw new CircuitOpenError('Circuit breaker is open');
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failureCount++;
    if (this.failureCount >= this.threshold) {
      this.state = 'open';
      setTimeout(() => {
        this.state = 'half-open';
      }, this.timeout);
    }
  }
}
```

### Retry with Exponential Backoff

```typescript
class RetryHandler {
  async execute<T>(operation: () => Promise<T>, maxAttempts: number = 3): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (attempt < maxAttempts) {
          const delay = Math.pow(2, attempt - 1) * 1000;
          await sleep(delay);
        }
      }
    }

    throw lastError;
  }
}
```

## Future Considerations

### 1. Advanced Similarity Search

```typescript
// Future: Additional vector database adapters (beyond Qdrant)
class AlternativeVectorDBAdapter implements VectorStorageAdapter {
  private client: PineconeClient | WeaviateClient;

  async findSimilar(
    embedding: number[],
    threshold: number,
    filters: VectorSearchFilters,
    limit?: number
  ): Promise<SimilarityResult[]> {
    // Alternative implementations for users with existing Pinecone/Weaviate infrastructure
    // Same HNSW approximate nearest neighbor performance characteristics
  }
}
```

### 2. Machine Learning Optimization

```typescript
// Future: Adaptive threshold based on use case
class AdaptiveThresholdManager {
  private feedback: FeedbackCollector;
  private model: MLModel;

  async optimizeThreshold(useCase: string): Promise<number> {
    // Learn optimal threshold from user feedback
    // Balance precision vs recall based on use case
    // Continuous optimization with online learning
  }
}
```

### 3. Edge Caching

```typescript
// Future: Edge deployment for ultra-low latency
class EdgeCacheManager {
  private edgeNodes: EdgeNode[];
  private syncManager: EdgeSyncManager;

  async deployToEdge(entry: CacheEntry): Promise<void> {
    // Deploy hot cache entries to edge locations
    // Synchronize across edge nodes
    // Handle edge-specific TTL and invalidation
  }
}
```

---

**Last Updated**: 2026-04-22  
**Version**: 1.0.0  
**Status**: Architecture Design
