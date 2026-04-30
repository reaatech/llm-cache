import type {
  CacheEntry,
  HealthStatus,
  InvalidationCriteria,
  SimilarityResult,
  StorageStats,
  VectorSearchFilters,
} from '../types/index.js';
import type { VectorStorageAdapter } from './StorageAdapter.js';

export interface InMemoryAdapterOptions {
  maxSize?: number;
}

export class InMemoryAdapter implements VectorStorageAdapter {
  private cache = new Map<string, CacheEntry>();
  private stats: StorageStats = {
    totalEntries: 0,
    totalSizeBytes: 0,
    hits: 0,
    misses: 0,
  };

  constructor(private options: InMemoryAdapterOptions = {}) {}

  get(key: string): Promise<CacheEntry | null> {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return Promise.resolve(null);
    }
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.misses++;
      return Promise.resolve(null);
    }
    this.stats.hits++;
    return Promise.resolve(entry);
  }

  set(key: string, entry: CacheEntry): Promise<void> {
    this.enforceSizeLimit();
    this.cache.set(key, entry);
    this.stats.totalEntries = this.cache.size;
    this.stats.totalSizeBytes += JSON.stringify(entry).length;
    return Promise.resolve();
  }

  delete(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    const deleted = this.cache.delete(key);
    if (deleted && entry) {
      this.stats.totalSizeBytes = Math.max(
        0,
        this.stats.totalSizeBytes - JSON.stringify(entry).length,
      );
    }
    return Promise.resolve(deleted);
  }

  exists(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) return Promise.resolve(false);
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return Promise.resolve(false);
    }
    return Promise.resolve(true);
  }

  async getBatch(keys: string[]): Promise<(CacheEntry | null)[]> {
    return Promise.all(keys.map((k) => this.get(k)));
  }

  async setBatch(items: Array<{ key: string; entry: CacheEntry }>): Promise<void> {
    for (const { key, entry } of items) {
      await this.set(key, entry);
    }
  }

  deleteBatch(keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.cache.delete(key)) count++;
    }
    return Promise.resolve(count);
  }

  findByUseCase(useCase: string, limit?: number): Promise<CacheEntry[]> {
    const results: CacheEntry[] = [];
    for (const entry of this.cache.values()) {
      if (entry.useCase === useCase && !this.isExpired(entry)) {
        results.push(entry);
        if (limit && results.length >= limit) break;
      }
    }
    return Promise.resolve(results);
  }

  findByModelVersion(modelVersion: string, limit?: number): Promise<CacheEntry[]> {
    const results: CacheEntry[] = [];
    for (const entry of this.cache.values()) {
      if (entry.modelVersion === modelVersion && !this.isExpired(entry)) {
        results.push(entry);
        if (limit && results.length >= limit) break;
      }
    }
    return Promise.resolve(results);
  }

  findSimilar(
    embedding: number[],
    threshold: number,
    filters: VectorSearchFilters,
    limit = 10,
  ): Promise<SimilarityResult[]> {
    const results: SimilarityResult[] = [];

    for (const entry of this.cache.values()) {
      if (this.isExpired(entry)) continue;
      if (filters.useCase && entry.useCase !== filters.useCase) continue;
      if (filters.modelVersion && entry.modelVersion !== filters.modelVersion) continue;
      if (
        filters.generationConfigHash &&
        entry.generationConfigHash !== filters.generationConfigHash
      )
        continue;
      if (filters.embeddingModel && entry.embeddingModel !== filters.embeddingModel) continue;
      if (filters.embeddingDimensions && entry.embeddingDimensions !== filters.embeddingDimensions)
        continue;

      const similarity = this.cosineSimilarity(embedding, entry.embedding);
      if (similarity >= threshold) {
        results.push({ entry, similarity });
      }
    }

    return Promise.resolve(results.sort((a, b) => b.similarity - a.similarity).slice(0, limit));
  }

  invalidateByCriteria(criteria: InvalidationCriteria): Promise<number> {
    let count = 0;
    for (const [key, entry] of this.cache) {
      let match = true;
      if (criteria.useCase && entry.useCase !== criteria.useCase) match = false;
      if (criteria.modelVersion && entry.modelVersion !== criteria.modelVersion) match = false;
      if (
        criteria.generationConfigHash &&
        entry.generationConfigHash !== criteria.generationConfigHash
      )
        match = false;
      if (criteria.embeddingModel && entry.embeddingModel !== criteria.embeddingModel)
        match = false;
      if (criteria.olderThan && entry.metadata.createdAt > criteria.olderThan) match = false;
      if (criteria.promptHash && entry.promptHash !== criteria.promptHash) match = false;

      if (match) {
        this.stats.totalSizeBytes = Math.max(
          0,
          this.stats.totalSizeBytes - JSON.stringify(entry).length,
        );
        this.cache.delete(key);
        count++;
      }
    }
    this.stats.totalEntries = this.cache.size;
    return Promise.resolve(count);
  }

  getStats(): Promise<StorageStats> {
    return Promise.resolve({ ...this.stats, totalEntries: this.cache.size });
  }

  healthCheck(): Promise<HealthStatus> {
    return Promise.resolve({ healthy: true });
  }

  private isExpired(entry: CacheEntry): boolean {
    return entry.metadata.expiresAt.getTime() < Date.now();
  }

  private enforceSizeLimit(): void {
    const maxSize = this.options.maxSize ?? 10_000;
    while (this.cache.size >= maxSize) {
      // FIFO eviction by insertion order. Not true LRU; keeps the in-memory store predictable
      // for tests and dev. Production callers should use Redis or DynamoDB.
      const firstKey = this.cache.keys().next().value;
      if (firstKey === undefined) break;
      this.cache.delete(firstKey);
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    }

    let dotProduct = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }

    if (magA === 0 || magB === 0) return 0;
    return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
  }
}
