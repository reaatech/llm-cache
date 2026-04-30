export interface CacheEntry {
  id: string;
  prompt: string;
  promptHash: string;
  response: unknown;
  embedding: number[];
  model: string;
  modelVersion: string;
  generationConfigHash: string;
  embeddingModel: string;
  embeddingDimensions: number;
  useCase: string;
  sensitive: boolean;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  cost: {
    prompt: number;
    completion: number;
    total: number;
  };
  metadata: {
    createdAt: Date;
    ttl: number;
    expiresAt: Date;
    queryType: 'factual' | 'creative' | 'analytical';
    confidence?: number;
  };
}

export interface CacheHit {
  hit: true;
  type: 'exact' | 'semantic';
  entry: CacheEntry;
  confidence?: number;
  similarity?: number;
  cachedAt: Date;
  age: number;
}

export interface CacheMiss {
  hit: false;
  reason: 'not_found' | 'below_threshold' | 'expired' | 'dimension_mismatch';
}

export type CacheResult = CacheHit | CacheMiss;

export interface CacheOptions {
  useCase?: string;
  modelVersion?: string;
  generationConfigHash?: string;
  model?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  systemPrompt?: string;
  tools?: unknown[];
  responseFormat?: 'text' | 'json_object' | 'json_schema';
}

export interface CacheMetadata {
  queryType?: 'factual' | 'creative' | 'analytical';
  ttl?: number;
  sensitive?: boolean;
  tokens?: {
    prompt: number;
    completion: number;
  };
}

export interface CostCalculatorLike {
  calculateCost(
    model: string,
    promptTokens: number,
    completionTokens: number,
    currency?: string,
  ): {
    inputCost: number;
    outputCost: number;
    totalCost: number;
    currency: string;
  };
}

export interface InvalidateResult {
  total: number;
  storage: number;
  vectorStorage: number;
}

export interface VectorSearchFilters {
  useCase?: string;
  modelVersion?: string;
  generationConfigHash?: string;
  embeddingModel?: string;
  embeddingDimensions?: number;
}

export interface SimilarityResult {
  entry: CacheEntry;
  similarity: number;
}

export interface InvalidationCriteria {
  useCase?: string;
  modelVersion?: string;
  generationConfigHash?: string;
  embeddingModel?: string;
  olderThan?: Date;
  promptHash?: string;
}

export interface StorageStats {
  totalEntries: number;
  totalSizeBytes: number;
  hits: number;
  misses: number;
}

export interface HealthStatus {
  healthy: boolean;
  message?: string;
}
