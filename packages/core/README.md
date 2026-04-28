# @llm-cache/core

Core caching engine for llm-cache — semantic and exact-match caching with embedding-based similarity.

## Install

```bash
npm install @llm-cache/core
```

## Usage

```typescript
import { CacheEngine, InMemoryAdapter, OpenAIEmbedder } from '@llm-cache/core';

const cache = new CacheEngine({
  storage: new InMemoryAdapter(),
  vectorStorage: new InMemoryAdapter(),
  embedder: new OpenAIEmbedder({
    provider: 'openai',
    model: 'text-embedding-3-small',
    dimensions: 1536,
    apiKey: process.env.OPENAI_API_KEY,
  }),
  config: {
    storage: { adapter: 'memory' },
    vectorStorage: { adapter: 'memory' },
    embedding: {
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 1536,
      batchSize: 100,
      maxRetries: 3,
    },
    similarity: { threshold: 0.8, metric: 'cosine', maxResults: 10 },
    ttl: {
      default: 3600,
      factual: 1800,
      creative: 7200,
      analytical: 3600,
      sensitive: 600,
      byUseCase: {},
    },
    segmentation: { enabled: true, defaultUseCase: 'general' },
    cost: { enabled: true, currency: 'USD' },
    observability: { metrics: true, tracing: false, logging: 'info' },
  },
});

await cache.set(
  'What is TypeScript?',
  { answer: 'A typed superset of JavaScript' },
  {
    model: 'gpt-4',
    modelVersion: 'gpt-4-0613',
  }
);

const result = await cache.get('What is TypeScript?', {
  model: 'gpt-4',
  modelVersion: 'gpt-4-0613',
});
// { hit: true, type: 'exact', entry: {...} }
```

## Exports

- `CacheEngine` — Main caching orchestrator
- `InMemoryAdapter` — In-memory storage/vector adapter
- `OpenAIEmbedder` — OpenAI embedding provider
- `SimilarityMatcher` — Cosine similarity matcher
- `CacheConfigSchema` — Zod config validation schema
- `buildPromptHash`, `buildCacheFingerprint`, `buildExactMatchKey` — Hash utilities

## License

MIT
