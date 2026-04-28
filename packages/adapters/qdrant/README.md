# @llm-cache/adapters-qdrant

Qdrant vector database adapter for llm-cache semantic search.

## Install

```bash
npm install @llm-cache/adapters-qdrant
```

## Usage

```typescript
import { QdrantAdapter } from '@llm-cache/adapters-qdrant';

const adapter = new QdrantAdapter({
  url: 'http://localhost:6333',
  collectionName: 'llm-cache',
  vectorSize: 1536,
  distance: 'Cosine',
});
await adapter.connect();

// Use adapter with CacheEngine
const cache = new CacheEngine({
  storage: /* Redis, DynamoDB, or InMemoryAdapter */,
  vectorStorage: adapter,
  embedder,
  config,
});
```

## Notes

- Automatically creates the collection and payload indexes on first `connect()`.
- Supports hybrid search (vector similarity + metadata filtering).
- `findSimilar` filters by `useCase`, `modelVersion`, `generationConfigHash`, and `embeddingModel`.

## License

MIT
