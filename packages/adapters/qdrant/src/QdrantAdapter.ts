import { QdrantClient } from '@qdrant/js-client-rest';
import { v5 as uuidv5 } from 'uuid';
import type {
  CacheEntry,
  InvalidationCriteria,
  StorageStats,
  HealthStatus,
  SimilarityResult,
  VectorSearchFilters,
} from '@reaatech/llm-cache';
import type { VectorStorageAdapter } from '@reaatech/llm-cache';

// Stable namespace UUID so the same key always maps to the same point ID across processes.
const KEY_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

export interface QdrantAdapterConfig {
  url: string;
  apiKey?: string;
  collectionName: string;
  vectorSize: number;
  distance?: 'Cosine' | 'Euclid' | 'Dot';
  scrollPageSize?: number;
}

export class QdrantAdapter implements VectorStorageAdapter {
  private client: QdrantClient;
  private config: QdrantAdapterConfig;
  private initialized = false;
  private scrollPageSize: number;

  constructor(config: QdrantAdapterConfig) {
    this.config = config;
    this.scrollPageSize = config.scrollPageSize ?? 256;
    this.client = new QdrantClient({
      url: config.url,
      apiKey: config.apiKey,
      checkCompatibility: false,
    });
  }

  async connect(): Promise<void> {
    if (this.initialized) return;

    const collections = await this.client.getCollections();
    const exists = collections.collections.some((c) => c.name === this.config.collectionName);

    if (!exists) {
      await this.client.createCollection(this.config.collectionName, {
        vectors: {
          size: this.config.vectorSize,
          distance: this.config.distance ?? 'Cosine',
        },
      });

      // Create payload indexes for efficient filtering
      await this.client.createPayloadIndex(this.config.collectionName, {
        field_name: 'useCase',
        field_schema: 'keyword',
      });
      await this.client.createPayloadIndex(this.config.collectionName, {
        field_name: 'modelVersion',
        field_schema: 'keyword',
      });
      await this.client.createPayloadIndex(this.config.collectionName, {
        field_name: 'generationConfigHash',
        field_schema: 'keyword',
      });
      await this.client.createPayloadIndex(this.config.collectionName, {
        field_name: 'embeddingModel',
        field_schema: 'keyword',
      });
      await this.client.createPayloadIndex(this.config.collectionName, {
        field_name: 'createdAtMs',
        field_schema: 'integer',
      });
    }

    this.initialized = true;
  }

  disconnect(): Promise<void> {
    this.initialized = false;
    return Promise.resolve();
  }

  async get(key: string): Promise<CacheEntry | null> {
    const result = await this.client.retrieve(this.config.collectionName, {
      ids: [this.toPointId(key)],
      with_payload: true,
      with_vector: true,
    });

    if (result.length === 0) return null;

    const point = result[0];
    if (!point.payload) return null;

    const entry = this.deserializeEntry(point.payload, point.vector as number[]);
    if (this.isExpired(entry)) {
      await this.delete(key);
      return null;
    }

    return entry;
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    await this.client.upsert(this.config.collectionName, {
      points: [
        {
          id: this.toPointId(key),
          vector: entry.embedding,
          payload: this.serializeEntry(key, entry),
        },
      ],
    });
  }

  async delete(key: string): Promise<boolean> {
    await this.client.delete(this.config.collectionName, {
      points: [this.toPointId(key)],
    });
    return true;
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.retrieve(this.config.collectionName, {
      ids: [this.toPointId(key)],
      with_payload: false,
      with_vector: false,
    });
    return result.length > 0;
  }

  async getBatch(keys: string[]): Promise<(CacheEntry | null)[]> {
    if (keys.length === 0) return [];
    const ids = keys.map((k) => this.toPointId(k));
    const result = await this.client.retrieve(this.config.collectionName, {
      ids,
      with_payload: true,
      with_vector: true,
    });

    const map = new Map<string, CacheEntry>();
    for (const point of result) {
      if (point.payload && point.vector) {
        const entry = this.deserializeEntry(point.payload, point.vector as number[]);
        if (!this.isExpired(entry)) {
          map.set(String(point.payload.cacheKey ?? ''), entry);
        }
      }
    }

    return keys.map((k) => map.get(k) ?? null);
  }

  async setBatch(items: Array<{ key: string; entry: CacheEntry }>): Promise<void> {
    if (items.length === 0) return;
    await this.client.upsert(this.config.collectionName, {
      points: items.map(({ key, entry }) => ({
        id: this.toPointId(key),
        vector: entry.embedding,
        payload: this.serializeEntry(key, entry),
      })),
    });
  }

  async deleteBatch(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    await this.client.delete(this.config.collectionName, {
      points: keys.map((k) => this.toPointId(k)),
    });
    return keys.length;
  }

  async findByUseCase(useCase: string, limit = 100): Promise<CacheEntry[]> {
    return this.scrollAll(
      { must: [{ key: 'useCase', match: { value: useCase } }] },
      limit,
      true
    );
  }

  async findByModelVersion(modelVersion: string, limit = 100): Promise<CacheEntry[]> {
    return this.scrollAll(
      { must: [{ key: 'modelVersion', match: { value: modelVersion } }] },
      limit,
      true
    );
  }

  async findSimilar(
    embedding: number[],
    threshold: number,
    filters: VectorSearchFilters,
    limit = 10
  ): Promise<SimilarityResult[]> {
    const mustConditions: Array<Record<string, unknown>> = [];

    if (filters.useCase) {
      mustConditions.push({ key: 'useCase', match: { value: filters.useCase } });
    }
    if (filters.modelVersion) {
      mustConditions.push({ key: 'modelVersion', match: { value: filters.modelVersion } });
    }
    if (filters.generationConfigHash) {
      mustConditions.push({
        key: 'generationConfigHash',
        match: { value: filters.generationConfigHash },
      });
    }
    if (filters.embeddingModel) {
      mustConditions.push({
        key: 'embeddingModel',
        match: { value: filters.embeddingModel },
      });
    }

    const result = await this.client.search(this.config.collectionName, {
      vector: embedding,
      limit,
      score_threshold: threshold,
      filter: mustConditions.length > 0 ? { must: mustConditions } : undefined,
      with_payload: true,
      with_vector: true,
    });

    return result
      .map((hit) => ({
        entry: this.deserializeEntry(hit.payload!, (hit.vector as number[]) ?? []),
        similarity: hit.score,
      }))
      .filter((r) => !this.isExpired(r.entry));
  }

  async invalidateByCriteria(criteria: InvalidationCriteria): Promise<number> {
    const mustConditions: Array<Record<string, unknown>> = [];

    if (criteria.useCase) {
      mustConditions.push({ key: 'useCase', match: { value: criteria.useCase } });
    }
    if (criteria.modelVersion) {
      mustConditions.push({ key: 'modelVersion', match: { value: criteria.modelVersion } });
    }
    if (criteria.generationConfigHash) {
      mustConditions.push({
        key: 'generationConfigHash',
        match: { value: criteria.generationConfigHash },
      });
    }
    if (criteria.embeddingModel) {
      mustConditions.push({
        key: 'embeddingModel',
        match: { value: criteria.embeddingModel },
      });
    }
    if (criteria.promptHash) {
      mustConditions.push({ key: 'promptHash', match: { value: criteria.promptHash } });
    }
    if (criteria.olderThan) {
      mustConditions.push({
        key: 'createdAtMs',
        range: { lt: criteria.olderThan.getTime() },
      });
    }

    if (mustConditions.length === 0) {
      // Refuse to invalidate the entire collection without any criteria.
      return 0;
    }

    let total = 0;
    let offset: string | number | undefined;

    for (;;) {
      const page = await this.client.scroll(this.config.collectionName, {
        filter: { must: mustConditions },
        limit: this.scrollPageSize,
        offset,
        with_payload: false,
        with_vector: false,
      });

      const ids = page.points.map((p) => p.id);
      if (ids.length > 0) {
        await this.client.delete(this.config.collectionName, { points: ids });
        total += ids.length;
      }

      if (!page.next_page_offset) break;
      offset = page.next_page_offset as string | number;
    }

    return total;
  }

  async getStats(): Promise<StorageStats> {
    const info = await this.client.getCollection(this.config.collectionName);
    return {
      totalEntries: info.points_count ?? 0,
      totalSizeBytes: 0,
      hits: 0,
      misses: 0,
    };
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      await this.client.getCollections();
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async scrollAll(
    filter: Record<string, unknown>,
    limit: number,
    withVector: boolean
  ): Promise<CacheEntry[]> {
    const out: CacheEntry[] = [];
    let offset: string | number | undefined;

    while (out.length < limit) {
      const remaining = limit - out.length;
      const page = await this.client.scroll(this.config.collectionName, {
        filter,
        limit: Math.min(this.scrollPageSize, remaining),
        offset,
        with_payload: true,
        with_vector: withVector,
      });

      for (const p of page.points) {
        if (!p.payload) continue;
        const entry = this.deserializeEntry(p.payload, (p.vector as number[]) ?? []);
        if (!this.isExpired(entry)) out.push(entry);
        if (out.length >= limit) break;
      }

      if (!page.next_page_offset) break;
      offset = page.next_page_offset as string | number;
    }

    return out;
  }

  private serializeEntry(key: string, entry: CacheEntry): Record<string, unknown> {
    return {
      cacheKey: key,
      id: entry.id,
      prompt: entry.prompt,
      promptHash: entry.promptHash,
      response: JSON.stringify(entry.response),
      model: entry.model,
      modelVersion: entry.modelVersion,
      generationConfigHash: entry.generationConfigHash,
      embeddingModel: entry.embeddingModel,
      embeddingDimensions: entry.embeddingDimensions,
      useCase: entry.useCase,
      sensitive: entry.sensitive,
      tokens: entry.tokens,
      cost: entry.cost,
      createdAtMs: entry.metadata.createdAt.getTime(),
      expiresAtMs: entry.metadata.expiresAt.getTime(),
      metadata: {
        createdAt: entry.metadata.createdAt.toISOString(),
        ttl: entry.metadata.ttl,
        expiresAt: entry.metadata.expiresAt.toISOString(),
        queryType: entry.metadata.queryType,
        confidence: entry.metadata.confidence,
      },
    };
  }

  private deserializeEntry(payload: Record<string, unknown>, vector: number[]): CacheEntry {
    const metadata = payload.metadata as Record<string, unknown>;

    let response: unknown = null;
    try {
      response = JSON.parse(String(payload.response));
    } catch {
      response = String(payload.response);
    }

    let createdAt: Date;
    let expiresAt: Date;
    try {
      createdAt = new Date(String(metadata.createdAt));
      expiresAt = new Date(String(metadata.expiresAt));
      if (isNaN(createdAt.getTime()) || isNaN(expiresAt.getTime())) {
        createdAt = new Date();
        expiresAt = new Date(Date.now() - 1);
      }
    } catch {
      createdAt = new Date();
      expiresAt = new Date(Date.now() - 1);
    }

    return {
      id: String(payload.id),
      prompt: String(payload.prompt),
      promptHash: String(payload.promptHash),
      response,
      embedding: vector,
      model: String(payload.model),
      modelVersion: String(payload.modelVersion),
      generationConfigHash: String(payload.generationConfigHash),
      embeddingModel: String(payload.embeddingModel),
      embeddingDimensions: Number(payload.embeddingDimensions),
      useCase: String(payload.useCase),
      sensitive: Boolean(payload.sensitive),
      tokens: this.coerceTokenCost(payload.tokens as Partial<{ prompt: number; completion: number; total: number }> | undefined),
      cost: this.coerceTokenCost(payload.cost as Partial<{ prompt: number; completion: number; total: number }> | undefined),
      metadata: {
        createdAt,
        ttl: Number(metadata.ttl) || 0,
        expiresAt,
        queryType: String(metadata.queryType) as 'factual' | 'creative' | 'analytical',
        confidence: metadata.confidence != null ? Number(metadata.confidence) : undefined,
      },
    };
  }

  private coerceTokenCost(obj?: Partial<{ prompt: number; completion: number; total: number }>): { prompt: number; completion: number; total: number } {
    if (!obj || typeof obj !== 'object') return { prompt: 0, completion: 0, total: 0 };
    const prompt = typeof obj.prompt === 'number' ? obj.prompt : 0;
    const completion = typeof obj.completion === 'number' ? obj.completion : 0;
    return { prompt, completion, total: prompt + completion };
  }

  private toPointId(key: string): string {
    return uuidv5(key, KEY_NAMESPACE);
  }

  private isExpired(entry: CacheEntry): boolean {
    return entry.metadata.expiresAt.getTime() < Date.now();
  }
}
