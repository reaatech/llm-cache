import { z } from 'zod';

export const CacheConfigSchema = z.object({
  storage: z.object({
    adapter: z.enum(['memory', 'redis', 'dynamodb']),
    options: z.record(z.unknown()).optional(),
  }),

  vectorStorage: z.object({
    adapter: z.enum(['qdrant', 'memory']),
    options: z.record(z.unknown()).optional(),
  }),

  embedding: z.object({
    provider: z.enum(['openai']),
    model: z.string().default('text-embedding-3-small'),
    dimensions: z.number().default(1536),
    batchSize: z.number().default(100),
    maxRetries: z.number().default(3),
  }),

  similarity: z.object({
    threshold: z.number().min(0).max(1).default(0.8),
    metric: z.enum(['cosine']).default('cosine'),
    maxResults: z.number().default(10),
  }),

  ttl: z.object({
    default: z.number().default(3600),
    factual: z.number().default(1800),
    creative: z.number().default(7200),
    analytical: z.number().default(3600),
    sensitive: z.number().default(600),
    byUseCase: z.record(z.number()).default({}),
  }),

  segmentation: z.object({
    enabled: z.boolean().default(true),
    defaultUseCase: z.string().default('general'),
    allowedUseCases: z.array(z.string()).optional(),
  }),

  cost: z.object({
    enabled: z.boolean().default(true),
    currency: z.string().default('USD'),
  }),

  observability: z.object({
    metrics: z.boolean().default(true),
    tracing: z.boolean().default(false),
    logging: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  }),

  security: z
    .object({
      encryption: z
        .object({
          enabled: z.boolean().default(false),
          algorithm: z.enum(['aes-256-gcm']).default('aes-256-gcm'),
        })
        .optional(),
      defaultSensitive: z.boolean().default(false),
    })
    .optional(),
});

export type CacheConfig = z.infer<typeof CacheConfigSchema>;
