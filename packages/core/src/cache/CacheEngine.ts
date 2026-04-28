import type {
  CacheEntry,
  CacheResult,
  CacheOptions,
  CacheMetadata,
  VectorSearchFilters,
  CostCalculatorLike,
  InvalidateResult,
} from '../types/index.js';
import type { StorageAdapter, VectorStorageAdapter } from '../storage/StorageAdapter.js';
import type { EmbeddingProvider } from '../embedding/EmbeddingProvider.js';
import type { CacheConfig } from '../config/CacheConfig.js';
import type { EncryptionService, EncryptedPayload } from '../utils/encryption.js';
import { buildPromptHash, buildCacheFingerprint, buildExactMatchKey } from '../utils/hash.js';
import { v4 as uuidv4 } from 'uuid';

export interface CacheEngineDependencies {
  storage: StorageAdapter;
  vectorStorage: VectorStorageAdapter;
  embedder: EmbeddingProvider;
  config: CacheConfig;
  costCalculator?: CostCalculatorLike;
  encryptionService?: EncryptionService;
}

export class CacheEngine {
  private storage: StorageAdapter;
  private vectorStorage: VectorStorageAdapter;
  private embedder: EmbeddingProvider;
  private config: CacheConfig;
  private costCalculator?: CostCalculatorLike;
  private encryption?: EncryptionService;

  constructor(deps: CacheEngineDependencies) {
    this.storage = deps.storage;
    this.vectorStorage = deps.vectorStorage;
    this.embedder = deps.embedder;
    this.config = deps.config;
    this.costCalculator = deps.costCalculator;
    this.encryption = deps.encryptionService;
  }

  async get(prompt: string, options?: CacheOptions): Promise<CacheResult> {
    if (!prompt) {
      return { hit: false, reason: 'not_found' };
    }

    const useCase = options?.useCase ?? this.config.segmentation.defaultUseCase;
    const generationConfigHash =
      options?.generationConfigHash ??
      buildCacheFingerprint({
        model: options?.model ?? 'unknown',
        modelVersion: options?.modelVersion ?? 'unknown',
        temperature: options?.temperature,
        topP: options?.topP,
        maxTokens: options?.maxTokens,
        systemPrompt: options?.systemPrompt,
        tools: options?.tools,
        responseFormat: options?.responseFormat,
      });

    const promptHash = buildPromptHash(prompt);
    const exactKey = buildExactMatchKey(promptHash, useCase, generationConfigHash);

    // Stage 1: Exact match lookup
    const exactMatch = await this.storage.get(exactKey);
    let exactExpired = false;
    if (exactMatch) {
      if (this.isExpired(exactMatch)) {
        exactExpired = true;
        await this.storage.delete(exactKey);
        await this.vectorStorage.delete(exactKey);
      } else {
        const decrypted = this.decryptEntry(exactMatch);
        return {
          hit: true,
          type: 'exact',
          entry: decrypted,
          cachedAt: decrypted.metadata.createdAt,
          age: Date.now() - decrypted.metadata.createdAt.getTime(),
        };
      }
    }

    // Stage 2: Semantic similarity search
    try {
      const embedding = await this.embedder.embed(prompt, this.config.embedding.dimensions);

      const filters: VectorSearchFilters = {
        useCase,
        modelVersion: options?.modelVersion,
        generationConfigHash,
        embeddingModel: this.config.embedding.model,
        embeddingDimensions: this.config.embedding.dimensions,
      };

      const similarEntries = await this.vectorStorage.findSimilar(
        embedding,
        this.config.similarity.threshold,
        filters,
        this.config.similarity.maxResults
      );

      const fresh = similarEntries.filter((r) => !this.isExpired(r.entry));
      const bestMatch = fresh[0];

      if (bestMatch) {
        const decrypted = this.decryptEntry(bestMatch.entry);
        return {
          hit: true,
          type: 'semantic',
          entry: decrypted,
          confidence: bestMatch.similarity,
          similarity: bestMatch.similarity,
          cachedAt: decrypted.metadata.createdAt,
          age: Date.now() - decrypted.metadata.createdAt.getTime(),
        };
      }
    } catch {
      // Embedding or vector search failed — fall through to miss
    }

    // Stage 3: Cache miss
    return {
      hit: false,
      reason: exactExpired ? 'expired' : 'not_found',
    };
  }

  async getBatch(
    prompts: Array<{ prompt: string; options?: CacheOptions }>
  ): Promise<Array<CacheResult | { hit: false; reason: 'error'; error: string }>> {
    const settled = await Promise.allSettled(
      prompts.map(({ prompt, options }) => this.get(prompt, options))
    );
    return settled.map((s) =>
      s.status === 'fulfilled'
        ? s.value
        : ({ hit: false, reason: 'error', error: errorMessage(s.reason) } as const)
    );
  }

  async set(
    prompt: string,
    response: unknown,
    options?: CacheOptions,
    metadata?: CacheMetadata
  ): Promise<CacheEntry> {
    if (!prompt) {
      throw new Error('Prompt must be a non-empty string');
    }

    const useCase = options?.useCase ?? this.config.segmentation.defaultUseCase;
    const generationConfigHash =
      options?.generationConfigHash ??
      buildCacheFingerprint({
        model: options?.model ?? 'unknown',
        modelVersion: options?.modelVersion ?? 'unknown',
        temperature: options?.temperature,
        topP: options?.topP,
        maxTokens: options?.maxTokens,
        systemPrompt: options?.systemPrompt,
        tools: options?.tools,
        responseFormat: options?.responseFormat,
      });

    const promptHash = buildPromptHash(prompt);
    const exactKey = buildExactMatchKey(promptHash, useCase, generationConfigHash);

    const embedding = await this.embedder.embed(prompt, this.config.embedding.dimensions);

    const queryType = metadata?.queryType ?? 'analytical';
    const sensitive = metadata?.sensitive ?? this.config.security?.defaultSensitive ?? false;
    const ttl = metadata?.ttl ?? this.resolveTTL(queryType, sensitive, useCase);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttl * 1000);

    const tokens = {
      prompt: metadata?.tokens?.prompt ?? 0,
      completion: metadata?.tokens?.completion ?? 0,
      total: (metadata?.tokens?.prompt ?? 0) + (metadata?.tokens?.completion ?? 0),
    };

    const cost = this.calculateCost(
      options?.model ?? 'unknown',
      tokens.prompt,
      tokens.completion
    );

    const entry: CacheEntry = {
      id: uuidv4(),
      prompt,
      promptHash,
      response,
      embedding,
      model: options?.model ?? 'unknown',
      modelVersion: options?.modelVersion ?? 'unknown',
      generationConfigHash,
      embeddingModel: this.config.embedding.model,
      embeddingDimensions: this.config.embedding.dimensions,
      useCase,
      sensitive,
      tokens,
      cost,
      metadata: {
        createdAt: now,
        ttl,
        expiresAt,
        queryType,
      },
    };

    const stored = this.encryptEntry(entry);
    await Promise.all([
      this.storage.set(exactKey, stored),
      this.vectorStorage.set(exactKey, stored),
    ]);

    return entry;
  }

  async setBatch(
    items: Array<{
      prompt: string;
      response: unknown;
      options?: CacheOptions;
      metadata?: CacheMetadata;
    }>
  ): Promise<Array<{ ok: true; entry: CacheEntry } | { ok: false; error: string }>> {
    const settled = await Promise.allSettled(
      items.map(({ prompt, response, options, metadata }) =>
        this.set(prompt, response, options, metadata)
      )
    );
    return settled.map((s) =>
      s.status === 'fulfilled'
        ? ({ ok: true, entry: s.value } as const)
        : ({ ok: false, error: errorMessage(s.reason) } as const)
    );
  }

  async invalidate(criteria: {
    useCase?: string;
    modelVersion?: string;
    generationConfigHash?: string;
    embeddingModel?: string;
    olderThan?: Date;
    promptHash?: string;
  }): Promise<InvalidateResult> {
    const results = await Promise.allSettled([
      this.storage.invalidateByCriteria(criteria),
      this.vectorStorage.invalidateByCriteria(criteria),
    ]);
    const storageCount = results[0].status === 'fulfilled' ? results[0].value : 0;
    const vectorCount = results[1].status === 'fulfilled' ? results[1].value : 0;
    return {
      total: storageCount,
      storage: storageCount,
      vectorStorage: vectorCount,
    };
  }

  async healthCheck(): Promise<{ storage: boolean; vectorStorage: boolean }> {
    const [storage, vectorStorage] = await Promise.all([
      this.storage.healthCheck(),
      this.vectorStorage.healthCheck(),
    ]);
    return {
      storage: storage.healthy,
      vectorStorage: vectorStorage.healthy,
    };
  }

  private isExpired(entry: CacheEntry): boolean {
    return entry.metadata.expiresAt.getTime() < Date.now();
  }

  private resolveTTL(queryType: string, sensitive: boolean, useCase: string): number {
    if (sensitive) {
      return this.config.ttl.sensitive;
    }
    if (this.config.ttl.byUseCase[useCase] !== undefined) {
      return this.config.ttl.byUseCase[useCase];
    }
    switch (queryType) {
      case 'factual':
        return this.config.ttl.factual;
      case 'creative':
        return this.config.ttl.creative;
      case 'analytical':
        return this.config.ttl.analytical;
      default:
        return this.config.ttl.default;
    }
  }

  private calculateCost(
    model: string,
    promptTokens: number,
    completionTokens: number
  ): { prompt: number; completion: number; total: number } {
    if (!this.config.cost.enabled || !this.costCalculator) {
      return { prompt: 0, completion: 0, total: 0 };
    }
    const breakdown = this.costCalculator.calculateCost(
      model,
      promptTokens,
      completionTokens,
      this.config.cost.currency
    );
    return {
      prompt: breakdown.inputCost,
      completion: breakdown.outputCost,
      total: breakdown.totalCost,
    };
  }

  private encryptEntry(entry: CacheEntry): CacheEntry {
    if (!this.encryption) return entry;
    return {
      ...entry,
      prompt: JSON.stringify(this.encryption.encrypt(entry.prompt)),
      response: JSON.stringify(this.encryption.encrypt(JSON.stringify(entry.response))),
    };
  }

  private decryptEntry(entry: CacheEntry): CacheEntry {
    if (!this.encryption) return entry;
    try {
      const promptPayload = JSON.parse(entry.prompt) as EncryptedPayload;
      const responsePayload = JSON.parse(entry.response as string) as EncryptedPayload;
      return {
        ...entry,
        prompt: this.encryption.decrypt(promptPayload),
        response: JSON.parse(this.encryption.decrypt(responsePayload)),
      };
    } catch {
      return entry;
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
