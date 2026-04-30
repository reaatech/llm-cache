import { CacheEngine, InMemoryAdapter, OpenAIEmbedder } from '@reaatech/llm-cache';
import type { CacheConfig } from '@reaatech/llm-cache';

const config: CacheConfig = {
  storage: { adapter: 'memory' },
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
  if (!apiKey) {
    console.error('Set OPENAI_API_KEY to run this example');
    process.exit(1);
  }

  const cache = new CacheEngine({
    storage: new InMemoryAdapter(),
    vectorStorage: new InMemoryAdapter(),
    embedder: new OpenAIEmbedder({
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 1536,
      apiKey,
    }),
    config,
  });

  // Store a response
  console.log('Storing cache entry...');
  await cache.set(
    'What is TypeScript?',
    { choices: [{ message: { content: 'TypeScript is a typed superset of JavaScript.' } }] },
    { model: 'gpt-4', modelVersion: 'gpt-4-0613' }
  );

  // Exact match
  console.log('Checking exact match...');
  const exact = await cache.get('What is TypeScript?', {
    model: 'gpt-4',
    modelVersion: 'gpt-4-0613',
  });
  console.log('Exact match:', exact.hit ? `${exact.type} hit` : 'miss');

  // Semantic match
  console.log('Checking semantic match...');
  const semantic = await cache.get('Tell me about TypeScript', {
    model: 'gpt-4',
    modelVersion: 'gpt-4-0613',
  });
  console.log(
    'Semantic match:',
    semantic.hit ? `${semantic.type} hit (confidence: ${semantic.confidence})` : 'miss'
  );

  // Miss
  console.log('Checking unrelated prompt...');
  const miss = await cache.get('What is the capital of Mongolia?', {
    model: 'gpt-4',
    modelVersion: 'gpt-4-0613',
  });
  console.log('Unrelated prompt:', miss.hit ? 'hit' : 'miss');
}

main().catch(console.error);
