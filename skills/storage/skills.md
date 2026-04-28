# Storage Agent Skills

## Overview

The Storage Agent is responsible for implementing storage adapters for the llm-cache project. This includes Redis, DynamoDB, and in-memory storage implementations with support for TTL, batch operations, and distributed locking.

## Capabilities

### 1. Storage Adapter Implementation

- Implement `StorageAdapter` interface for exact-match metadata storage
- Implement `VectorStorageAdapter` interface for semantic search backends
- Build connection pooling and management
- Create TTL enforcement mechanisms
- Implement batch operations

### 2. Redis Adapter

- Implement Redis connection management
- Build exact-match metadata storage with TTL
- Create distributed locking with Redlock
- Support Redis Cluster deployments
- Support Redis Stack (RediSearch) as optional vector search backend

### 3. DynamoDB Adapter

- Implement DynamoDB table operations
- Build GSI (Global Secondary Index) queries for metadata
- Create batch operations with TransactWriteItems
- Support DynamoDB Streams for invalidation
- Document that DynamoDB does not support native vector search; semantic search requires a vector database

### 4. In-Memory Adapter

- Implement LRU eviction policies
- Build TTL with background cleanup
- Create atomic operations
- Support for development and testing

## Input/Output Specifications

### Input

- StorageAdapter interface specification
- Performance requirements
- Configuration options
- Integration test scenarios

### Output

- Storage adapter implementations
- Connection management code
- Batch operation handlers
- Integration tests
- Performance benchmarks

## Usage Examples

### Example 1: Implementing Redis Adapter

**Request:**

```
Implement the Redis storage adapter with:
- Connection pooling
- TTL support using Redis EXPIRE
- Sorted sets for similarity search
- Distributed locking for concurrent access
```

**Response:**

```typescript
export class RedisAdapter implements StorageAdapter {
  private client: Redis;
  private lockManager: Redlock;
  private connectionPool: ConnectionPool<Redis>;

  constructor(config: RedisAdapterConfig) {
    this.client = redis.createClient({
      url: config.url,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
      },
    });

    this.lockManager = new Redlock([this.client], {
      driftFactor: 0.01,
      retryCount: 3,
      retryDelay: 200,
    });
  }

  async get(key: string): Promise<CacheEntry | null> {
    const data = await this.client.get(this.buildKey(key));
    if (!data) return null;

    const entry = JSON.parse(data) as CacheEntry;

    // Check if entry is expired
    const ttl = await this.client.ttl(this.buildKey(key));
    if (ttl === -2) return null; // Key doesn't exist or expired

    return entry;
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    const serialized = JSON.stringify(entry);
    const ttl = this.calculateTTL(entry);

    await this.client.setex(this.buildKey(key), ttl, serialized);

    // Update sorted set for similarity search
    await this.updateSimilarityIndex(entry);
  }

  // NOTE: Vanilla Redis does not support vector similarity search.
  // For semantic search, use QdrantAdapter
  // or Redis Stack with RediSearch vector search.
  async findSimilar(
    embedding: number[],
    threshold: number,
    filters: VectorSearchFilters,
    limit: number
  ): Promise<SimilarityResult[]> {
    throw new Error(
      'RedisAdapter does not support vector similarity search. ' +
        'Use QdrantAdapter or Redis Stack with RediSearch.'
    );
  }

  async acquireLock(resourceId: string, ttl: number): Promise<Lock> {
    return this.lockManager.acquire([`lock:${resourceId}`], ttl);
  }
}
```

### Example 2: Implementing DynamoDB Adapter

**Request:**

```
Implement the DynamoDB storage adapter with:
- Table schema with PK/SK and GSIs
- Batch operations
- TTL using DynamoDB TTL attribute
```

**Response:**

```typescript
export class DynamoDBAdapter implements StorageAdapter {
  private client: DynamoDBDocumentClient;
  private tableName: string;

  constructor(config: DynamoDBAdapterConfig) {
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.region }));
    this.tableName = config.tableName;
  }

  async get(key: string): Promise<CacheEntry | null> {
    const command = new GetCommand({
      TableName: this.tableName,
      Key: {
        PK: `CACHE#${key}`,
        SK: 'META',
      },
    });

    const result = await this.client.send(command);

    if (!result.Item) return null;

    return this.deserializeEntry(result.Item);
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    const command = new PutCommand({
      TableName: this.tableName,
      Item: {
        PK: `CACHE#${key}`,
        SK: 'META',
        GSI1PK: `USECASE#${entry.useCase}`,
        GSI1SK: `${entry.modelVersion}#${entry.metadata.createdAt.getTime()}`,
        GSI2PK: `MODEL#${entry.modelVersion}`,
        GSI2SK: `${entry.useCase}#${entry.metadata.createdAt.getTime()}`,
        embedding: entry.embedding,
        prompt: entry.prompt,
        response: entry.response,
        model: entry.model,
        modelVersion: entry.modelVersion,
        useCase: entry.useCase,
        tokens: entry.tokens,
        cost: entry.cost,
        metadata: entry.metadata,
        ttl: this.calculateTTL(entry),
        createdAt: entry.metadata.createdAt.toISOString(),
      },
    });

    await this.client.send(command);
  }

  async setBatch(entries: CacheEntry[]): Promise<void> {
    const writeRequests = entries.map((entry) => ({
      PutRequest: {
        Item: {
          PK: `CACHE#${this.buildKey(entry)}`,
          SK: 'META',
          GSI1PK: `USECASE#${entry.useCase}`,
          GSI1SK: `${entry.modelVersion}#${entry.metadata.createdAt.getTime()}`,
          GSI2PK: `MODEL#${entry.modelVersion}`,
          GSI2SK: `${entry.useCase}#${entry.metadata.createdAt.getTime()}`,
          ...entry,
          ttl: this.calculateTTL(entry),
        },
      },
    }));

    // Batch write in chunks of 25 (DynamoDB limit)
    for (let i = 0; i < writeRequests.length; i += 25) {
      const chunk = writeRequests.slice(i, i + 25);
      const command = new BatchWriteItemCommand({
        RequestItems: {
          [this.tableName]: chunk,
        },
      });

      await this.client.send(command);
    }
  }

  // NOTE: DynamoDB does not support native vector similarity search.
  // Semantic search is delegated to QdrantAdapter.
  async findSimilar(
    embedding: number[],
    threshold: number,
    filters: VectorSearchFilters,
    limit?: number
  ): Promise<SimilarityResult[]> {
    throw new Error(
      'DynamoDBAdapter does not support vector similarity search. ' +
        'Use QdrantAdapter for semantic search.'
    );
  }

  async findByUseCase(useCase: string, limit?: number): Promise<CacheEntry[]> {
    const command = new QueryCommand({
      TableName: this.tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `USECASE#${useCase}`,
      },
      Limit: limit,
    });

    const result = await this.client.send(command);
    return result.Items?.map((item) => this.deserializeEntry(item)) ?? [];
  }
}
```

## Best Practices

### 1. Connection Management

- Implement connection pooling
- Handle reconnection logic
- Use exponential backoff for retries
- Monitor connection health

### 2. Performance

- Batch operations when possible
- Use appropriate data structures
- Implement efficient indexing
- Cache frequently accessed data

### 3. Error Handling

- Handle connection failures gracefully
- Implement circuit breakers
- Provide meaningful error messages
- Log errors with context

### 4. Testing

- Use test containers for integration tests
- Mock external dependencies
- Test failure scenarios
- Measure performance benchmarks

## Constraints

### Technical Constraints

- Must implement StorageAdapter interface
- Must support TTL enforcement
- Must handle concurrent access
- Must support batch operations

### Performance Constraints

- Redis: < 1ms for simple operations
- DynamoDB: < 10ms for simple operations
- Must handle 1000+ operations/second
- Must support 1M+ entries

## Integration Points

### With Architect Agent

- Follow storage architecture specifications
- Implement data models as specified
- Provide performance feedback

### With Core Agent

- Implement storage interfaces
- Meet performance requirements
- Support all required operations

### With Observability Agent

- Add connection metrics
- Implement operation logging
- Add performance monitoring

### With Testing Agent

- Write integration tests
- Provide test scenarios
- Support test data setup

## Quality Metrics

- **Test Coverage**: 85%+ for adapter implementations
- **Performance**: Meets all latency targets
- **Reliability**: 99.9% uptime for storage operations
- **Scalability**: Supports 1M+ entries

## Tools and Resources

- **Redis**: redis npm package, Redlock
- **DynamoDB**: AWS SDK v3, DynamoDB Local
- **Qdrant**: @qdrant/js-client-rest, Qdrant Docker image
- **Testing**: Testcontainers, Vitest
- **Monitoring**: Custom metrics, AWS CloudWatch

---

**Skill Version**: 1.0.0  
**Last Updated**: 2026-04-22  
**Maintained by**: reiatech
