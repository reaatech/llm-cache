# Embedding Agent Skills

## Overview

The Embedding Agent is responsible for implementing embedding generation and similarity matching for the llm-cache project. This includes OpenAI embeddings integration, embedding caching, batch processing, and vector similarity calculations.

## Capabilities

### 1. Embedding Provider Integration

- Integrate with OpenAI embeddings API
- Implement embedding caching strategies
- Build batch embedding processing
- Handle rate limiting and retries
- Validate embedding model/dimension compatibility with cached entries

### 2. Similarity Calculation

- Implement cosine similarity algorithm
- Build vector distance calculations
- Create similarity threshold filtering
- Optimize vector comparison performance

### 3. Embedding Optimization

- Cache embeddings to reduce API costs
- Implement batch processing for efficiency
- Build embedding compression techniques
- Optimize embedding storage

### 4. Vector Operations

- Implement vector normalization
- Build efficient vector storage
- Create vector indexing strategies
- Optimize vector search performance

## Input/Output Specifications

### Input

- Embedding provider configuration
- Text prompts for embedding
- Similarity threshold requirements
- Performance requirements

### Output

- Embedding provider implementations
- Similarity calculation code
- Embedding cache implementation
- Performance benchmarks

## Usage Examples

### Example 1: Implementing OpenAI Embedder

**Request:**

```
Implement the OpenAI embedding provider with:
- Text embedding generation
- Batch processing support
- Embedding caching to reduce costs
- Rate limiting and retry logic
```

**Response:**

```typescript
export class OpenAIEmbedder implements EmbeddingProvider {
  private client: OpenAI;
  private cache: EmbeddingCache;
  private rateLimiter: RateLimiter;

  constructor(config: OpenAIEmbedderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      organization: config.organization,
    });

    this.cache = new EmbeddingCache({
      maxSize: config.cacheSize ?? 10000,
      ttl: config.cacheTTL ?? 86400, // 24 hours
    });

    this.rateLimiter = new RateLimiter({
      maxRequests: config.maxRequestsPerMinute ?? 3000,
      windowMs: 60000,
    });
  }

  async embed(text: string, expectedDimensions?: number): Promise<number[]> {
    // Check cache first
    const hash = this.hashText(text);
    const cached = await this.cache.get(hash);
    if (cached) {
      // Validate dimensions match current config to prevent mismatched embeddings
      if (expectedDimensions && cached.length !== expectedDimensions) {
        throw new Error(
          `Embedding dimension mismatch: cached=${cached.length}, expected=${expectedDimensions}. ` +
            'Embedding model may have changed.'
        );
      }
      return cached;
    }

    // Rate limit
    await this.rateLimiter.acquire();

    // Generate embedding
    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 1536,
    });

    const embedding = response.data[0].embedding;

    // Cache the result
    await this.cache.set(hash, embedding);

    return embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Check cache for all texts
    const results: (number[] | null)[] = new Array(texts.length).fill(null);
    const missingIndices: number[] = [];
    const missingTexts: string[] = [];

    for (let i = 0; i < texts.length; i++) {
      const hash = this.hashText(texts[i]);
      const cached = await this.cache.get(hash);
      if (cached) {
        results[i] = cached;
      } else {
        missingIndices.push(i);
        missingTexts.push(texts[i]);
      }
    }

    // Generate embeddings for missing texts
    if (missingTexts.length > 0) {
      await this.rateLimiter.acquire(Math.ceil(missingTexts.length / 100));

      const response = await this.client.embeddings.create({
        model: 'text-embedding-3-small',
        input: missingTexts,
        dimensions: 1536,
      });

      // Process results
      for (let i = 0; i < missingIndices.length; i++) {
        const embedding = response.data[i].embedding;
        results[missingIndices[i]] = embedding;

        // Cache each embedding
        const hash = this.hashText(missingTexts[i]);
        await this.cache.set(hash, embedding);
      }
    }

    return results as number[][];
  }

  private hashText(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }
}
```

### Example 2: Implementing Similarity Calculator

**Request:**

```
Implement the SimilarityCalculator with cosine similarity and efficient vector operations
```

**Response:**

```typescript
export class SimilarityCalculator {
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

  normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));

    if (magnitude === 0) {
      return vector;
    }

    return vector.map((val) => val / magnitude);
  }

  findMostSimilar(
    targetEmbedding: number[],
    candidates: Array<{ embedding: number[]; metadata: any }>,
    limit: number = 10
  ): Array<{ item: any; similarity: number }> {
    const results = candidates.map((candidate) => ({
      item: candidate.metadata,
      similarity: this.calculateCosineSimilarity(targetEmbedding, candidate.embedding),
    }));

    // Sort by similarity (descending) and limit results
    return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  }

  batchSimilarity(targetEmbeddings: number[], candidateEmbeddings: number[][]): number[][] {
    const similarities: number[][] = [];

    for (const target of targetEmbeddings) {
      const targetSimilarities: number[] = [];

      for (const candidate of candidateEmbeddings) {
        targetSimilarities.push(this.calculateCosineSimilarity(target, candidate));
      }

      similarities.push(targetSimilarities);
    }

    return similarities;
  }
}
```

## Best Practices

### 1. API Usage Optimization

- Cache embeddings aggressively
- Use batch processing when possible
- Implement exponential backoff for retries
- Monitor API usage and costs

### 2. Performance

- Use typed arrays for vector operations
- Implement vector normalization
- Cache similarity calculations
- Optimize hot paths with profiling

### 3. Error Handling

- Handle API rate limits gracefully
- Implement circuit breakers
- Provide meaningful error messages
- Log API usage and errors

### 4. Cost Optimization

- Cache embeddings to reduce API calls
- Use smaller embedding dimensions when possible
- Batch requests to reduce overhead
- Monitor and optimize embedding costs

## Constraints

### Technical Constraints

- Must support OpenAI embeddings API
- Must implement embedding caching
- Must handle rate limiting
- Must support batch processing

### Performance Constraints

- Embedding generation: < 500ms average
- Similarity calculation: < 1ms per comparison
- Cache hit rate: > 80% for repeated prompts
- Must handle 100+ concurrent requests

## Cross-References

- **Core Agent**: For `SimilarityMatcher` integration and cosine similarity usage in cache lookup orchestration, see `skills/core/skills.md`.
- **Storage Agent**: For embedding storage strategies and vector database integration, see `skills/storage/skills.md`.

## Integration Points

### With Architect Agent

- Follow embedding architecture specifications
- Implement embedding storage as specified
- Provide performance feedback

### With Core Agent

- Implement embedding provider interfaces
- Meet performance requirements
- Support batch processing

### With Storage Agent

- Store embeddings efficiently
- Implement embedding indices
- Optimize embedding retrieval

### With Cost Agent

- Track embedding API costs
- Provide usage metrics
- Optimize cost efficiency

## Quality Metrics

- **Test Coverage**: 90%+ for embedding functionality
- **Performance**: Meets all latency targets
- **Cache Hit Rate**: > 80% for repeated prompts
- **Cost Efficiency**: Minimize embedding API costs

## Tools and Resources

- **OpenAI SDK**: openai npm package
- **Vector Operations**: Custom implementations, numeric libraries
- **Caching**: lru-cache, Redis
- **Monitoring**: Custom metrics, API usage tracking

---

**Skill Version**: 1.0.0  
**Last Updated**: 2026-04-22  
**Maintained by**: reiatech
