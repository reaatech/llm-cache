import { type CacheConfig, CacheConfigSchema } from '@reaatech/llm-cache';

export interface ServerConfig {
  port: number;
  storageAdapter: 'memory' | 'redis' | 'dynamodb';
  vectorStorageAdapter: 'memory' | 'qdrant';
  redisUrl?: string;
  dynamodbRegion?: string;
  dynamodbTable?: string;
  dynamodbEndpoint?: string;
  qdrantUrl?: string;
  qdrantCollection?: string;
  qdrantApiKey?: string;
  openaiApiKey?: string;
  openaiOrganization?: string;
  apiKey?: string;
  maxBodyBytes: number;
  cacheConfig: CacheConfig;
}

function parseNumber(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

function parseFloatValue(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

export function loadConfig(): ServerConfig {
  const rawConfig: CacheConfig = {
    storage: {
      adapter: (process.env.STORAGE_ADAPTER as 'memory' | 'redis' | 'dynamodb') ?? 'memory',
    },
    vectorStorage: {
      adapter: (process.env.VECTOR_STORAGE_ADAPTER as 'memory' | 'qdrant') ?? 'memory',
    },
    embedding: {
      provider: 'openai',
      model: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
      dimensions: parseNumber(process.env.OPENAI_EMBEDDING_DIMENSIONS, 1536),
      batchSize: parseNumber(process.env.EMBEDDING_BATCH_SIZE, 100),
      maxRetries: parseNumber(process.env.EMBEDDING_MAX_RETRIES, 3),
    },
    similarity: {
      threshold: parseFloatValue(process.env.SIMILARITY_THRESHOLD, 0.8),
      metric: 'cosine',
      maxResults: parseNumber(process.env.SIMILARITY_MAX_RESULTS, 10),
    },
    ttl: {
      default: parseNumber(process.env.TTL_DEFAULT, 3600),
      factual: parseNumber(process.env.TTL_FACTUAL, 1800),
      creative: parseNumber(process.env.TTL_CREATIVE, 7200),
      analytical: parseNumber(process.env.TTL_ANALYTICAL, 3600),
      sensitive: parseNumber(process.env.TTL_SENSITIVE, 600),
      byUseCase: {},
    },
    segmentation: {
      enabled: process.env.SEGMENTATION_ENABLED !== 'false',
      defaultUseCase: process.env.DEFAULT_USE_CASE ?? 'general',
    },
    cost: {
      enabled: process.env.COST_TRACKING_ENABLED !== 'false',
      currency: process.env.COST_CURRENCY ?? 'USD',
    },
    observability: {
      metrics: process.env.METRICS_ENABLED !== 'false',
      tracing: process.env.TRACING_ENABLED === 'true',
      logging: ['error', 'warn', 'info', 'debug'].includes(process.env.LOG_LEVEL ?? '')
        ? (process.env.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug')
        : 'info',
    },
  };

  const result = CacheConfigSchema.safeParse(rawConfig);
  if (!result.success) {
    const issues = result.error.issues
      .map(
        (issue: { path: (string | number)[]; message: string }) =>
          `${issue.path.join('.')}: ${issue.message}`,
      )
      .join(', ');
    throw new Error(`Invalid configuration: ${issues}`);
  }

  return {
    port: parseNumber(process.env.PORT, 3000),
    storageAdapter: rawConfig.storage.adapter,
    vectorStorageAdapter: rawConfig.vectorStorage.adapter,
    redisUrl: process.env.REDIS_URL,
    dynamodbRegion: process.env.DYNAMODB_REGION,
    dynamodbTable: process.env.DYNAMODB_TABLE,
    dynamodbEndpoint: process.env.DYNAMODB_ENDPOINT,
    qdrantUrl: process.env.QDRANT_URL,
    qdrantCollection: process.env.QDRANT_COLLECTION,
    qdrantApiKey: process.env.QDRANT_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiOrganization: process.env.OPENAI_ORGANIZATION,
    apiKey: process.env.LLM_CACHE_API_KEY,
    maxBodyBytes: parseNumber(process.env.MAX_BODY_BYTES, 1_048_576),
    cacheConfig: rawConfig,
  };
}
