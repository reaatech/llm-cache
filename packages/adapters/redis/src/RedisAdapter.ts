import { createClient, type RedisClientType } from 'redis';
import type { CacheEntry, InvalidationCriteria, StorageStats, HealthStatus } from '@reaatech/llm-cache';
import type { StorageAdapter } from '@reaatech/llm-cache';

export interface RedisAdapterConfig {
  url: string;
  keyPrefix?: string;
}

function sanitizeRedisUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.password = '[REDACTED]';
    }
    return parsed.toString();
  } catch {
    return url.replace(/:\/\/[^@]*@/, '://[REDACTED]@');
  }
}

function safeParseJson(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export class RedisAdapter implements StorageAdapter {
  private client: RedisClientType;
  private keyPrefix: string;

  constructor(config: RedisAdapterConfig) {
    this.client = createClient({
      url: config.url,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
      },
    });
    this.client.on('error', (err: Error) => {
      // eslint-disable-next-line no-console
      console.error('Redis client error:', sanitizeRedisUrl(err.message));
    });
    this.keyPrefix = config.keyPrefix ?? 'llm-cache:';
  }

  async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  async get(key: string): Promise<CacheEntry | null> {
    const data = await this.client.get(this.buildKey(key));
    if (!data) return null;

    const parsed = safeParseJson(data);
    if (!parsed) return null;

    const entry = parsed as CacheEntry;
    entry.metadata.createdAt = new Date(entry.metadata.createdAt);
    entry.metadata.expiresAt = new Date(entry.metadata.expiresAt);

    if (this.isExpired(entry)) {
      await this.delete(key);
      return null;
    }

    return entry;
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    const serialized = JSON.stringify(entry);
    const ttlSeconds = Math.ceil((entry.metadata.expiresAt.getTime() - Date.now()) / 1000);

    if (ttlSeconds <= 0) {
      await this.delete(key);
      return;
    }

    await this.client.setEx(this.buildKey(key), ttlSeconds, serialized);
  }

  async delete(key: string): Promise<boolean> {
    const result = await this.client.del(this.buildKey(key));
    return result > 0;
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(this.buildKey(key));
    return result > 0;
  }

  async getBatch(keys: string[]): Promise<(CacheEntry | null)[]> {
    if (keys.length === 0) return [];

    const prefixedKeys = keys.map((k) => this.buildKey(k));
    const results = await this.client.mGet(prefixedKeys);

    return results.map((data) => {
      if (!data) return null;
      const parsed = safeParseJson(data);
      if (!parsed) return null;
      const entry = parsed as CacheEntry;
      entry.metadata.createdAt = new Date(entry.metadata.createdAt);
      entry.metadata.expiresAt = new Date(entry.metadata.expiresAt);
      return this.isExpired(entry) ? null : entry;
    });
  }

  async setBatch(items: Array<{ key: string; entry: CacheEntry }>): Promise<void> {
    const multi = this.client.multi();

    for (const { key, entry } of items) {
      const serialized = JSON.stringify(entry);
      const ttlSeconds = Math.ceil((entry.metadata.expiresAt.getTime() - Date.now()) / 1000);
      if (ttlSeconds > 0) {
        multi.setEx(this.buildKey(key), ttlSeconds, serialized);
      }
    }

    await multi.exec();
  }

  async deleteBatch(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    const prefixedKeys = keys.map((k) => this.buildKey(k));
    return this.client.del(prefixedKeys);
  }

  async findByUseCase(useCase: string, limit = 100): Promise<CacheEntry[]> {
    // Redis doesn't natively support metadata queries without additional indexing.
    // For now, scan all keys and filter. Production deployments should use
    // Redis Stack (RediSearch) or a secondary index for efficient metadata queries.
    const pattern = `${this.keyPrefix}*`;
    const entries: CacheEntry[] = [];

    for await (const key of this.client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      const data = await this.client.get(key);
      if (!data) continue;

      const parsed = safeParseJson(data);
      if (!parsed) continue;
      const entry = parsed as CacheEntry;
      entry.metadata.createdAt = new Date(entry.metadata.createdAt);
      entry.metadata.expiresAt = new Date(entry.metadata.expiresAt);

      if (!this.isExpired(entry) && entry.useCase === useCase) {
        entries.push(entry);
        if (entries.length >= limit) break;
      }
    }

    return entries;
  }

  async findByModelVersion(modelVersion: string, limit = 100): Promise<CacheEntry[]> {
    const pattern = `${this.keyPrefix}*`;
    const entries: CacheEntry[] = [];

    for await (const key of this.client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      const data = await this.client.get(key);
      if (!data) continue;

      const parsed = safeParseJson(data);
      if (!parsed) continue;
      const entry = parsed as CacheEntry;
      entry.metadata.createdAt = new Date(entry.metadata.createdAt);
      entry.metadata.expiresAt = new Date(entry.metadata.expiresAt);

      if (!this.isExpired(entry) && entry.modelVersion === modelVersion) {
        entries.push(entry);
        if (entries.length >= limit) break;
      }
    }

    return entries;
  }

  async invalidateByCriteria(criteria: InvalidationCriteria): Promise<number> {
    let count = 0;
    const pattern = `${this.keyPrefix}*`;

    for await (const key of this.client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      const data = await this.client.get(key);
      if (!data) continue;

      const parsed = safeParseJson(data);
      if (!parsed) continue;
      const entry = parsed as CacheEntry;
      entry.metadata.createdAt = new Date(entry.metadata.createdAt);
      entry.metadata.expiresAt = new Date(entry.metadata.expiresAt);

      if (this.isExpired(entry)) {
        await this.client.del(key);
        count++;
        continue;
      }

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
        await this.client.del(key);
        count++;
      }
    }

    return count;
  }

  async getStats(): Promise<StorageStats> {
    let totalEntries = 0;
    try {
      const info = await this.client.info('keyspace');
      const match = info?.match(/keys=(\d+)/);
      totalEntries = match ? parseInt(match[1], 10) : 0;
    } catch {
      // info('keyspace') may not be available on all Redis versions
    }

    return {
      totalEntries,
      totalSizeBytes: 0,
      hits: 0,
      misses: 0,
    };
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      await this.client.ping();
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Redis ping failed',
      };
    }
  }

  private buildKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  private isExpired(entry: CacheEntry): boolean {
    return entry.metadata.expiresAt.getTime() < Date.now();
  }
}
