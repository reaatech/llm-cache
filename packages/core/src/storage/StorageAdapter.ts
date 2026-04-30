import type {
  CacheEntry,
  HealthStatus,
  InvalidationCriteria,
  SimilarityResult,
  StorageStats,
  VectorSearchFilters,
} from '../types/index.js';

export interface StorageAdapter {
  // Core Operations
  get(key: string): Promise<CacheEntry | null>;
  set(key: string, entry: CacheEntry): Promise<void>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;

  // Batch Operations
  getBatch(keys: string[]): Promise<(CacheEntry | null)[]>;
  setBatch(entries: Array<{ key: string; entry: CacheEntry }>): Promise<void>;
  deleteBatch(keys: string[]): Promise<number>;

  // Metadata Queries
  findByUseCase(useCase: string, limit?: number): Promise<CacheEntry[]>;
  findByModelVersion(modelVersion: string, limit?: number): Promise<CacheEntry[]>;

  // Management
  invalidateByCriteria(criteria: InvalidationCriteria): Promise<number>;
  getStats(): Promise<StorageStats>;
  healthCheck(): Promise<HealthStatus>;

  // Lifecycle
  connect?(): Promise<void>;
  disconnect?(): Promise<void>;
}

export interface VectorStorageAdapter extends StorageAdapter {
  // Vector Search Operations
  findSimilar(
    embedding: number[],
    threshold: number,
    filters: VectorSearchFilters,
    limit?: number,
  ): Promise<SimilarityResult[]>;
}
