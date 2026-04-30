import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommand,
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  CacheEntry,
  HealthStatus,
  InvalidationCriteria,
  StorageAdapter,
  StorageStats,
} from '@reaatech/llm-cache';

export interface DynamoDBAdapterConfig {
  region: string;
  tableName: string;
  endpoint?: string;
  /** Attribute name DynamoDB uses for native row TTL. Match your table config. */
  ttlAttribute?: string;
}

export class DynamoDBAdapter implements StorageAdapter {
  private client: DynamoDBDocumentClient;
  private rawClient: DynamoDBClient;
  private tableName: string;
  private ttlAttribute: string;

  constructor(config: DynamoDBAdapterConfig) {
    const dbClient = new DynamoDBClient({
      region: config.region,
      endpoint: config.endpoint,
    });
    this.rawClient = dbClient;
    this.client = DynamoDBDocumentClient.from(dbClient, {
      marshallOptions: { convertEmptyValues: false, removeUndefinedValues: true },
    });
    this.tableName = config.tableName;
    this.ttlAttribute = config.ttlAttribute ?? 'expiresAtEpoch';
  }

  async get(key: string): Promise<CacheEntry | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: key },
      }),
    );

    if (!result.Item) return null;

    const entry = this.deserialize(result.Item);
    if (this.isExpired(entry)) {
      await this.delete(key);
      return null;
    }

    return entry;
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: this.serialize(key, entry),
      }),
    );
  }

  async delete(key: string): Promise<boolean> {
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { pk: key },
      }),
    );
    return true;
  }

  async exists(key: string): Promise<boolean> {
    const entry = await this.get(key);
    return entry !== null;
  }

  async getBatch(keys: string[]): Promise<(CacheEntry | null)[]> {
    if (keys.length === 0) return [];

    const result = await this.client.send(
      new BatchGetCommand({
        RequestItems: {
          [this.tableName]: {
            Keys: keys.map((k) => ({ pk: k })),
          },
        },
      }),
    );

    const items = result.Responses?.[this.tableName] ?? [];
    const map = new Map<string, CacheEntry>();

    for (const item of items) {
      const entry = this.deserialize(item);
      if (!this.isExpired(entry)) {
        map.set(String(item.pk), entry);
      }
    }

    return keys.map((k) => map.get(k) ?? null);
  }

  async setBatch(items: Array<{ key: string; entry: CacheEntry }>): Promise<void> {
    const writeRequests: Array<{ PutRequest: { Item: Record<string, unknown> } }> = items.map(
      ({ key, entry }) => ({
        PutRequest: {
          Item: this.serialize(key, entry),
        },
      }),
    );

    // DynamoDB batch write supports max 25 items per request
    for (let i = 0; i < writeRequests.length; i += 25) {
      const chunk = writeRequests.slice(i, i + 25);
      await this.client.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.tableName]: chunk,
          },
        }),
      );
    }
  }

  async deleteBatch(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;

    const writeRequests: Array<{ DeleteRequest: { Key: Record<string, unknown> } }> = keys.map(
      (k) => ({
        DeleteRequest: {
          Key: { pk: k },
        },
      }),
    );

    for (let i = 0; i < writeRequests.length; i += 25) {
      const chunk = writeRequests.slice(i, i + 25);
      await this.client.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.tableName]: chunk,
          },
        }),
      );
    }

    return keys.length;
  }

  async findByUseCase(useCase: string, limit = 100): Promise<CacheEntry[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'gsi1',
        KeyConditionExpression: 'gsi1pk = :pk',
        ExpressionAttributeValues: {
          ':pk': `USECASE#${useCase}`,
        },
        Limit: limit,
      }),
    );

    return (result.Items ?? [])
      .map((item) => this.deserialize(item))
      .filter((e) => !this.isExpired(e));
  }

  async findByModelVersion(modelVersion: string, limit = 100): Promise<CacheEntry[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'gsi2',
        KeyConditionExpression: 'gsi2pk = :pk',
        ExpressionAttributeValues: {
          ':pk': `MODEL#${modelVersion}`,
        },
        Limit: limit,
      }),
    );

    return (result.Items ?? [])
      .map((item) => this.deserialize(item))
      .filter((e) => !this.isExpired(e));
  }

  async invalidateByCriteria(criteria: InvalidationCriteria): Promise<number> {
    let count = 0;

    if (criteria.useCase) {
      let lastKey: Record<string, unknown> | undefined;
      do {
        const result = await this.client.send(
          new QueryCommand({
            TableName: this.tableName,
            IndexName: 'gsi1',
            KeyConditionExpression: 'gsi1pk = :pk',
            ExpressionAttributeValues: { ':pk': `USECASE#${criteria.useCase}` },
            ExclusiveStartKey: lastKey,
          }),
        );
        for (const item of result.Items ?? []) {
          const entry = this.deserialize(item);
          if (this.matchesCriteria(entry, criteria)) {
            await this.delete(String(item.pk));
            count++;
          }
        }
        lastKey = result.LastEvaluatedKey;
      } while (lastKey);
      return count;
    }

    if (criteria.modelVersion) {
      let lastKey: Record<string, unknown> | undefined;
      do {
        const result = await this.client.send(
          new QueryCommand({
            TableName: this.tableName,
            IndexName: 'gsi2',
            KeyConditionExpression: 'gsi2pk = :pk',
            ExpressionAttributeValues: { ':pk': `MODEL#${criteria.modelVersion}` },
            ExclusiveStartKey: lastKey,
          }),
        );
        for (const item of result.Items ?? []) {
          const entry = this.deserialize(item);
          if (this.matchesCriteria(entry, criteria)) {
            await this.delete(String(item.pk));
            count++;
          }
        }
        lastKey = result.LastEvaluatedKey;
      } while (lastKey);
      return count;
    }

    // Fallback: paginated table scan. Expensive — avoid in production.
    let lastKey: Record<string, unknown> | undefined;
    do {
      const result = await this.client.send(
        new ScanCommand({ TableName: this.tableName, ExclusiveStartKey: lastKey }),
      );
      for (const item of result.Items ?? []) {
        const entry = this.deserialize(item);
        if (this.isExpired(entry) || this.matchesCriteria(entry, criteria)) {
          await this.delete(String(item.pk));
          count++;
        }
      }
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    return count;
  }

  async getStats(): Promise<StorageStats> {
    try {
      const result = await this.rawClient.send(
        new DescribeTableCommand({ TableName: this.tableName }),
      );
      const itemCount = result.Table?.ItemCount ?? 0;
      const sizeBytes = result.Table?.TableSizeBytes ?? 0;
      return {
        totalEntries: itemCount,
        totalSizeBytes: sizeBytes,
        hits: 0,
        misses: 0,
      };
    } catch {
      return {
        totalEntries: 0,
        totalSizeBytes: 0,
        hits: 0,
        misses: 0,
      };
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      await this.client.send(
        new ScanCommand({
          TableName: this.tableName,
          Limit: 1,
        }),
      );
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'DynamoDB scan failed',
      };
    }
  }

  private serialize(key: string, entry: CacheEntry): Record<string, unknown> {
    return {
      pk: key,
      gsi1pk: `USECASE#${entry.useCase}`,
      gsi1sk: `${entry.modelVersion}#${entry.generationConfigHash}`,
      gsi2pk: `MODEL#${entry.modelVersion}`,
      gsi2sk: `${entry.useCase}#${entry.metadata.createdAt.toISOString()}`,
      id: entry.id,
      promptHash: entry.promptHash,
      prompt: entry.prompt,
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
      // Native DynamoDB TTL: epoch seconds. Enable on the table with this attribute name.
      [this.ttlAttribute]: Math.floor(entry.metadata.expiresAt.getTime() / 1000),
      metadata: {
        createdAt: entry.metadata.createdAt.toISOString(),
        ttl: entry.metadata.ttl,
        expiresAt: entry.metadata.expiresAt.toISOString(),
        queryType: entry.metadata.queryType,
        confidence: entry.metadata.confidence,
      },
    };
  }

  private deserialize(item: Record<string, unknown>): CacheEntry {
    const metadata = item.metadata as Record<string, unknown>;

    let response: unknown = null;
    try {
      response = JSON.parse(String(item.response ?? 'null'));
    } catch {
      response = String(item.response ?? '');
    }

    let createdAt: Date;
    let expiresAt: Date;
    try {
      createdAt = new Date(String(metadata.createdAt));
      expiresAt = new Date(String(metadata.expiresAt));
      if (Number.isNaN(createdAt.getTime()) || Number.isNaN(expiresAt.getTime())) {
        createdAt = new Date();
        expiresAt = new Date(Date.now() - 1);
      }
    } catch {
      createdAt = new Date();
      expiresAt = new Date(Date.now() - 1);
    }

    return {
      id: String(item.id ?? ''),
      prompt: String(item.prompt ?? ''),
      promptHash: String(item.promptHash ?? ''),
      response,
      embedding: [],
      model: String(item.model ?? ''),
      modelVersion: String(item.modelVersion ?? ''),
      generationConfigHash: String(item.generationConfigHash ?? ''),
      embeddingModel: String(item.embeddingModel ?? ''),
      embeddingDimensions: Number(item.embeddingDimensions ?? 0),
      useCase: String(item.useCase ?? ''),
      sensitive: Boolean(item.sensitive),
      tokens: this.coerceTokenCost(
        item.tokens as Partial<{ prompt: number; completion: number; total: number }> | undefined,
      ),
      cost: this.coerceTokenCost(
        item.cost as Partial<{ prompt: number; completion: number; total: number }> | undefined,
      ),
      metadata: {
        createdAt,
        ttl: Number(metadata.ttl) || 0,
        expiresAt,
        queryType: String(metadata.queryType) as 'factual' | 'creative' | 'analytical',
        confidence: metadata.confidence != null ? Number(metadata.confidence) : undefined,
      },
    };
  }

  private coerceTokenCost(obj?: Partial<{ prompt: number; completion: number; total: number }>): {
    prompt: number;
    completion: number;
    total: number;
  } {
    if (!obj || typeof obj !== 'object') return { prompt: 0, completion: 0, total: 0 };
    const prompt = typeof obj.prompt === 'number' ? obj.prompt : 0;
    const completion = typeof obj.completion === 'number' ? obj.completion : 0;
    return { prompt, completion, total: prompt + completion };
  }

  private isExpired(entry: CacheEntry): boolean {
    return entry.metadata.expiresAt.getTime() < Date.now();
  }

  private matchesCriteria(entry: CacheEntry, criteria: InvalidationCriteria): boolean {
    if (
      criteria.generationConfigHash &&
      entry.generationConfigHash !== criteria.generationConfigHash
    )
      return false;
    if (criteria.embeddingModel && entry.embeddingModel !== criteria.embeddingModel) return false;
    if (criteria.olderThan && entry.metadata.createdAt > criteria.olderThan) return false;
    if (criteria.promptHash && entry.promptHash !== criteria.promptHash) return false;
    if (criteria.modelVersion && entry.modelVersion !== criteria.modelVersion) return false;
    if (criteria.useCase && entry.useCase !== criteria.useCase) return false;
    return true;
  }
}
