# @llm-cache/adapters-redis

Redis storage adapter for llm-cache exact-match metadata storage.

## Install

```bash
npm install @llm-cache/adapters-redis
```

## Usage

```typescript
import { RedisAdapter } from '@llm-cache/adapters-redis';

const adapter = new RedisAdapter({ url: 'redis://localhost:6379' });
await adapter.connect();

// Use adapter with CacheEngine
const cache = new CacheEngine({
  storage: adapter,
  vectorStorage: /* Qdrant or InMemoryAdapter */,
  embedder,
  config,
});
```

## Notes

- Redis stores exact-match metadata with TTL via `EXPIRE` (no manual eviction needed).
- Semantic search requires a vector database (e.g., Qdrant); this adapter does not implement `findSimilar`.
- **Performance warning**: `findByUseCase`, `findByModelVersion`, and `invalidateByCriteria` all use `SCAN` and walk the full keyspace, fetching each value to filter in process. They are O(N) in the size of the cache and should not be called on a hot request path. For production-scale metadata queries, deploy Redis Stack and add RediSearch indexes, or run these calls from a background job.

## License

MIT
