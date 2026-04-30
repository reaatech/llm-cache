# @reaatech/llm-cache-adapters-qdrant

[![npm version](https://img.shields.io/npm/v/@reaatech/llm-cache-adapters-qdrant.svg)](https://www.npmjs.com/package/@reaatech/llm-cache-adapters-qdrant)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/llm-cache/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/llm-cache/ci.yml?branch=main&label=CI)](https://github.com/reaatech/llm-cache/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Qdrant vector database adapter for llm-cache semantic search. Implements `VectorStorageAdapter` with HNSW approximate nearest neighbor search, metadata filtering, and deterministic UUID-based point IDs for keyspace isolation.

## Installation

```bash
npm install @reaatech/llm-cache-adapters-qdrant
# or
pnpm add @reaatech/llm-cache-adapters-qdrant
```

## Feature Overview

- **HNSW search** — low-latency cosine similarity search via Qdrant's approximate nearest neighbor engine
- **Auto-provisioning** — `connect()` creates the collection and five payload indexes on first run
- **Metadata filtering** — `findSimilar` filters by `useCase`, `modelVersion`, `generationConfigHash`, and `embeddingModel`
- **Deterministic point IDs** — UUID v5 from cache keys for stable point identity across processes
- **Paginated invalidation** — `invalidateByCriteria` scrolls with configurable page size, deletes in batches
- **Hybrid search** — vector similarity combined with filter conditions in a single Qdrant query

## Quick Start

```typescript
import { CacheEngine, InMemoryAdapter, OpenAIEmbedder } from "@reaatech/llm-cache";
import { QdrantAdapter } from "@reaatech/llm-cache-adapters-qdrant";

const vectorStorage = new QdrantAdapter({
  url: "http://localhost:6333",
  collectionName: "llm-cache",
  vectorSize: 1536,
});
await vectorStorage.connect();

const cache = new CacheEngine({
  storage: new InMemoryAdapter(), // or RedisAdapter / DynamoDBAdapter
  vectorStorage,
  embedder: new OpenAIEmbedder({
    provider: "openai",
    model: "text-embedding-3-small",
    dimensions: 1536,
    apiKey: process.env.OPENAI_API_KEY,
  }),
  config: { /* ... */ },
});
```

## API Reference

### `QdrantAdapter` (class)

Implements `VectorStorageAdapter` from `@reaatech/llm-cache`.

```typescript
import { QdrantAdapter } from "@reaatech/llm-cache-adapters-qdrant";

const adapter = new QdrantAdapter({
  url: "http://localhost:6333",
  collectionName: "llm-cache",
  vectorSize: 1536,
});
await adapter.connect();
```

#### `QdrantAdapterConfig`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `url` | `string` | (required) | Qdrant server URL |
| `collectionName` | `string` | (required) | Collection name (created on first `connect()`) |
| `vectorSize` | `number` | (required) | Embedding vector dimensions (e.g., 1536 for `text-embedding-3-small`) |
| `apiKey` | `string` | — | Qdrant API key for authentication |
| `distance` | `"Cosine" \| "Euclid" \| "Dot"` | `"Cosine"` | Distance metric for vector similarity |
| `scrollPageSize` | `number` | `256` | Page size for paginated scroll operations |

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `connect()` | `Promise<void>` | Create collection and payload indexes if they don't exist |
| `disconnect()` | `Promise<void>` | Reset initialized state (client stays open) |
| `get(key)` | `Promise<CacheEntry \| null>` | Retrieve a point by deterministic UUID and deserialize |
| `set(key, entry)` | `Promise<void>` | Upsert a point with embedding vector and payload |
| `delete(key)` | `Promise<boolean>` | Delete a point by deterministic UUID |
| `exists(key)` | `Promise<boolean>` | Check if a point exists |
| `getBatch(keys)` | `Promise<(CacheEntry \| null)[]>` | Batch retrieve multiple points |
| `setBatch(items)` | `Promise<void>` | Batch upsert multiple points |
| `deleteBatch(keys)` | `Promise<number>` | Batch delete multiple points |
| `findSimilar(embedding, threshold, filters, limit?)` | `Promise<SimilarityResult[]>` | Semantic search with metadata filtering |
| `findByUseCase(useCase, limit?)` | `Promise<CacheEntry[]>` | Scroll entries filtered by use case |
| `findByModelVersion(modelVersion, limit?)` | `Promise<CacheEntry[]>` | Scroll entries filtered by model version |
| `invalidateByCriteria(criteria)` | `Promise<number>` | Paginated scroll + batch delete (refuses empty criteria) |
| `getStats()` | `Promise<StorageStats>` | Get `points_count` from collection info |
| `healthCheck()` | `Promise<HealthStatus>` | Call `getCollections()` and report status |

### `VectorSearchFilters`

Pass to `findSimilar()` to narrow semantic search results:

| Property | Type | Description |
|----------|------|-------------|
| `useCase` | `string` | Filter to a specific use case |
| `modelVersion` | `string` | Filter to a specific model version |
| `generationConfigHash` | `string` | Filter to a specific generation config fingerprint |
| `embeddingModel` | `string` | Filter to a specific embedding model |

## Usage Patterns

### Semantic Search with Filters

```typescript
const results = await adapter.findSimilar(
  embedding,           // query vector
  0.8,                 // cosine similarity threshold
  {
    useCase: "qa",
    modelVersion: "gpt-4-0613",
  },
  10                   // max results
);

for (const { entry, similarity } of results) {
  console.log(`Match (${similarity.toFixed(3)}): ${entry.prompt}`);
}
```

### API Key Authentication

```typescript
const adapter = new QdrantAdapter({
  url: "https://qdrant.example.com",
  collectionName: "llm-cache",
  vectorSize: 1536,
  apiKey: process.env.QDRANT_API_KEY,
});
```

### Custom Distance Metric

```typescript
const adapter = new QdrantAdapter({
  url: "http://localhost:6333",
  collectionName: "llm-cache",
  vectorSize: 1536,
  distance: "Dot", // Cosine | Euclid | Dot
});
```

### Periodic Cleanup

The adapter does not auto-evict expired points. Schedule cleanup:

```typescript
const removed = await adapter.invalidateByCriteria({
  olderThan: new Date(Date.now() - 24 * 3600_000), // older than 24 hours
});
console.log(`Cleaned ${removed} expired points`);
```

## Notes

- Auto-created payload indexes: `useCase`, `modelVersion`, `generationConfigHash`, `embeddingModel`, `createdAtMs`.
- `invalidateByCriteria` refuses to delete the entire collection — at least one criterion must be specified.
- Point IDs are deterministic UUID v5 from cache keys using a stable namespace UUID. The same key always maps to the same point.
- Metadata queries (`findByUseCase`, `findByModelVersion`) use `scroll` with payload decoding and expiry filtering.

## Related Packages

- [`@reaatech/llm-cache`](https://www.npmjs.com/package/@reaatech/llm-cache) — Core caching engine and types
- [`@reaatech/llm-cache-adapters-redis`](https://www.npmjs.com/package/@reaatech/llm-cache-adapters-redis) — Redis storage adapter (exact-match metadata)

## License

[MIT](https://github.com/reaatech/llm-cache/blob/main/LICENSE)
