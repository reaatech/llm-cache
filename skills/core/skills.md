# Core Agent Skills

## Overview

The Core Agent is responsible for implementing the core caching engine of the llm-cache project. This includes the cache lookup orchestration, similarity matching, embedding integration, and cache entry management.

## Capabilities

### 1. Cache Engine Implementation

- Implement multi-stage cache lookup (exact → semantic)
- Build cache entry management systems
- Create TTL enforcement mechanisms
- Implement model version tracking

### 2. Similarity Matching

- Implement cosine similarity algorithms
- Build threshold-based filtering
- Create result ranking and scoring
- Optimize vector comparison performance

### 3. Embedding Integration

- Integrate with OpenAI embeddings API
- Implement embedding caching strategies
- Build batch embedding processing
- Handle embedding rate limiting and retries

### 4. Cache Management

- Implement cache invalidation strategies
- Build use case segmentation
- Create cache warming mechanisms
- Implement batch operations

## Input/Output Specifications

### Input

- Architecture specifications from Architect Agent
- Storage adapter interfaces from Storage Agent
- Embedding provider specifications
- Configuration requirements

### Output

- CacheEngine implementation
- SimilarityMatcher implementation
- Cache entry management code
- Integration tests
- API documentation

## Usage Examples

### Example 1: Implementing Cache Lookup

**Request:**

```
Implement the multi-stage cache lookup logic for the CacheEngine with:
- Exact match using SHA-256 hash
- Semantic similarity search with configurable threshold
- Use case and model version filtering
- Confidence scoring for semantic matches
```

**Response:**

```typescript
export class CacheEngine {
  async get(prompt: string, options?: CacheOptions): Promise<CacheResult> {
    const startTime = Date.now();
    const useCase = options?.useCase ?? this.config.segmentation.defaultUseCase;
    const modelVersion = options?.modelVersion ?? this.config.model.version;

    // Stage 1: Exact match lookup
    const promptHash = this.hashPrompt(prompt);
    const exactMatch = await this.storage.get(this.buildKey(promptHash, useCase, modelVersion));

    if (exactMatch && !this.isExpired(exactMatch)) {
      this.metrics.recordHit('exact', Date.now() - startTime);
      return {
        hit: true,
        type: 'exact',
        entry: exactMatch,
        cachedAt: exactMatch.metadata.createdAt,
        age: Date.now() - exactMatch.metadata.createdAt.getTime(),
      };
    }

    // Stage 2: Semantic similarity search
    const embedding = await this.embedder.embed(prompt);
    const similarEntries = await this.vectorStorage.findSimilar(
      embedding,
      {
        useCase,
        modelVersion,
        generationConfigHash: options?.generationConfigHash ?? this.config.generationConfigHash,
        embeddingModel: this.config.embedding.model,
        embeddingDimensions: this.config.embedding.dimensions,
      },
      this.config.similarity.threshold,
      this.config.similarity.maxResults
    );

    const bestMatch = similarEntries.find(
      (entry) =>
        entry.similarity >= this.config.similarity.threshold && !this.isExpired(entry.entry)
    );

    if (bestMatch) {
      this.metrics.recordHit('semantic', Date.now() - startTime);
      return {
        hit: true,
        type: 'semantic',
        entry: bestMatch.entry,
        confidence: bestMatch.similarity,
        similarity: bestMatch.similarity,
        cachedAt: bestMatch.entry.metadata.createdAt,
        age: Date.now() - bestMatch.entry.metadata.createdAt.getTime(),
      };
    }

    // Stage 3: Cache miss
    this.metrics.recordMiss(Date.now() - startTime);
    return {
      hit: false,
      reason: 'not_found',
    };
  }
}
```

### Example 2: Implementing Similarity Matching

**Request:**

```
Implement the SimilarityMatcher with cosine similarity calculation and threshold filtering
```

**Response:**

```typescript
export class SimilarityMatcher {
  calculateCosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same dimensions');
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
  }

  async findSimilar(
    embedding: number[],
    filters: VectorSearchFilters,
    threshold: number,
    limit: number = 10
  ): Promise<SimilarityResult[]> {
    // Delegate to Qdrant vector storage backend which uses HNSW
    // for approximate nearest neighbor search. This is O(log N) instead of O(N).
    const results = await this.vectorStorage.findSimilar(embedding, threshold, filters, limit);

    // Post-process: verify not expired and sort by similarity
    return results
      .filter((r) => !this.isExpired(r.entry))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }
}
```

## Best Practices

### 1. Code Quality

- Follow TypeScript strict mode
- Use explicit return types
- Handle all error cases
- Write comprehensive tests
- Document public APIs

### 2. Performance

- Optimize hot paths
- Use efficient data structures
- Implement caching where appropriate
- Profile before optimizing

### 3. Error Handling

- Use typed error classes
- Provide meaningful error messages
- Log errors with context
- Implement graceful degradation

### 4. Testing

- Unit test all functions
- Integration test with storage adapters
- Test edge cases and error scenarios
- Measure test coverage (target: 90%+)

## Constraints

### Technical Constraints

- Must support TypeScript 5.4+
- Must be compatible with Node.js 18+
- Must follow ESLint rules
- Must pass all tests
- Must maintain type safety

### Performance Constraints

- Exact match lookup: < 1ms (p99)
- Semantic search: < 50ms (p99) for 100K+ entries (via HNSW vector database)
- Memory overhead: < 100MB base
- Must handle 1000+ concurrent requests

## Integration Points

### With Architect Agent

- Follow architectural specifications
- Implement design patterns as specified
- Provide feedback on implementation challenges

### With Storage Agent

- Use storage adapter interfaces
- Provide performance requirements
- Test with all storage implementations

### With Embedding Agent

- Use embedding provider interfaces
- Handle embedding API errors
- Optimize embedding batch sizes

### With Observability Agent

- Instrument code with metrics
- Add structured logging
- Implement distributed tracing

### With Testing Agent

- Write unit and integration tests
- Provide test scenarios
- Maintain test coverage

## Quality Metrics

- **Test Coverage**: 90%+ for core functionality
- **Performance**: Meets all latency targets
- **Vector Database**: Qdrant (primary)
- **Code Quality**: Zero ESLint errors
- **Documentation**: 100% API documentation
- **Type Safety**: No `any` types in public APIs

## Tools and Resources

- **Testing**: Vitest, @vitest/coverage-v8
- **Profiling**: Node.js profiler, clinic.js
- **Documentation**: TypeDoc, Markdown
- **Code Quality**: ESLint, Prettier

---

**Skill Version**: 1.0.0  
**Last Updated**: 2026-04-22  
**Maintained by**: reiatech
