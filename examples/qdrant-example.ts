import { CacheEngine, InMemoryAdapter, OpenAIEmbedder } from '@llm-cache/core';
import { QdrantAdapter } from '@llm-cache/adapters-qdrant';
import type { CacheConfig } from '@llm-cache/core';

const config: CacheConfig = {
  storage: { adapter: 'memory' },
  vectorStorage: { adapter: 'qdrant' },
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
  const qdrantUrl = process.env.QDRANT_URL ?? 'http://localhost:6333';

  if (!apiKey) {
    console.error('Set OPENAI_API_KEY to run this example');
    process.exit(1);
  }

  const vectorStorage = new QdrantAdapter({
    url: qdrantUrl,
    collectionName: 'llm-cache-example',
    vectorSize: 1536,
  });
  await vectorStorage.connect();

  const cache = new CacheEngine({
    storage: new InMemoryAdapter(),
    vectorStorage,
    embedder: new OpenAIEmbedder({
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 1536,
      apiKey,
    }),
    config,
  });

  await cache.set(
    'Explain quantum computing',
    { answer: 'Quantum computing uses qubits...' },
    { model: 'gpt-4', modelVersion: 'gpt-4-0613' }
  );

  const result = await cache.get('What is quantum computing?', {
    model: 'gpt-4',
    modelVersion: 'gpt-4-0613',
  });
  console.log('Semantic result:', result);

  await vectorStorage.disconnect();
}

main().catch(console.error);
