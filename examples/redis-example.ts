import type { CacheConfig } from '@reaatech/llm-cache';
import { CacheEngine, InMemoryAdapter, OpenAIEmbedder } from '@reaatech/llm-cache';
import { RedisAdapter } from '@reaatech/llm-cache-adapters-redis';

const config: CacheConfig = {
  storage: { adapter: 'redis' },
  vectorStorage: { adapter: 'memory' },
  embedding: {
    provider: 'openai',
    model: 'text-embedding-3-small',
    dimensions: 1536,
    batchSize: 100,
    maxRetries: 3,
  },
  similarity: {
    threshold: 0.8,
    metric: 'cosine',
    maxResults: 10,
  },
  ttl: {
    default: 3600,
    factual: 1800,
    creative: 7200,
    analytical: 3600,
    sensitive: 600,
    byUseCase: {},
  },
  segmentation: {
    enabled: true,
    defaultUseCase: 'general',
  },
  cost: {
    enabled: true,
    currency: 'USD',
  },
  observability: {
    metrics: true,
    tracing: false,
    logging: 'info',
  },
};

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

  if (!apiKey) {
    console.error('Set OPENAI_API_KEY to run this example');
    process.exit(1);
  }

  const storage = new RedisAdapter({ url: redisUrl });
  await storage.connect();

  const cache = new CacheEngine({
    storage,
    vectorStorage: new InMemoryAdapter(),
    embedder: new OpenAIEmbedder({
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 1536,
      apiKey,
    }),
    config,
  });

  await cache.set(
    'What is Redis?',
    { answer: 'An in-memory data structure store' },
    { model: 'gpt-4', modelVersion: 'gpt-4-0613' },
  );

  const result = await cache.get('What is Redis?', { model: 'gpt-4', modelVersion: 'gpt-4-0613' });
  console.log('Result:', result);

  await storage.disconnect();
}

main().catch(console.error);
