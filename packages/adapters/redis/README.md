# @reaatech/llm-cache-adapters-redis

[![npm version](https://img.shields.io/npm/v/@reaatech/llm-cache-adapters-redis.svg)](https://www.npmjs.com/package/@reaatech/llm-cache-adapters-redis)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/llm-cache/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/llm-cache/ci.yml?branch=main&label=CI)](https://github.com/reaatech/llm-cache/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Redis storage adapter for llm-cache exact-match metadata. Provides sub-millisecond key-value operations with automatic TTL via `SETEX`, connection pooling with reconnection, and key-space scanning for metadata queries.

## Installation

```bash
npm install @reaatech/llm-cache-adapters-redis
# or
pnpm add @reaatech/llm-cache-adapters-redis
```

## Feature Overview

- **Automatic TTL** — every `set()` call uses `SETEX` for automatic Redis-side expiration
- **Connection pooling** — single `node-redis` client with configurable reconnect strategy
- **Batch operations** — `getBatch`, `setBatch`, and `deleteBatch` for bulk workloads
- **Metadata queries** — `findByUseCase` and `findByModelVersion` via `SCAN` with in-process filtering
- **Invalidation** — `invalidateByCriteria` supports useCase, modelVersion, generationConfigHash, embeddingModel, olderThan, and promptHash
- **Stats** — `getStats()` returns `keys` count from Redis `INFO keyspace`
- **Health check** — `healthCheck()` pings Redis and reports status

## Quick Start

```typescript
import { CacheEngine, OpenAIEmbedder } from "@reaatech/llm-cache";
import { RedisAdapter } from "@reaatech/llm-cache-adapters-redis";

const storage = new RedisAdapter({ url: "redis://localhost:6379" });
await storage.connect();

const cache = new CacheEngine({
  storage,
  vectorStorage: /* QdrantAdapter or InMemoryAdapter */,
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

### `RedisAdapter` (class)

Implements `StorageAdapter` from `@reaatech/llm-cache`.

```typescript
import { RedisAdapter } from "@reaatech/llm-cache-adapters-redis";

const adapter = new RedisAdapter({ url: "redis://localhost:6379" });
await adapter.connect();
```

#### `RedisAdapterConfig`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `url` | `string` | (required) | Redis connection URL (supports `redis://`, `rediss://`, password in URL) |
| `keyPrefix` | `string` | `"llm-cache:"` | Prefix prepended to all Redis keys |

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `connect()` | `Promise<void>` | Open the Redis connection (idempotent) |
| `disconnect()` | `Promise<void>` | Close the Redis connection |
| `get(key)` | `Promise<CacheEntry \| null>` | Retrieve and deserialize a cache entry (auto-deletes if expired) |
| `set(key, entry)` | `Promise<void>` | Store an entry with TTL via `SETEX` (deletes instead if TTL ≤ 0) |
| `delete(key)` | `Promise<boolean>` | Remove a key |
| `exists(key)` | `Promise<boolean>` | Check if a key exists |
| `getBatch(keys)` | `Promise<(CacheEntry \| null)[]>` | Batch retrieve via `MGET` |
| `setBatch(items)` | `Promise<void>` | Batch store via pipelined `MULTI`/`EXEC` |
| `deleteBatch(keys)` | `Promise<number>` | Batch delete via `DEL` (multiple keys) |
| `findByUseCase(useCase, limit?)` | `Promise<CacheEntry[]>` | Scan keyspace for entries matching a use case |
| `findByModelVersion(modelVersion, limit?)` | `Promise<CacheEntry[]>` | Scan keyspace for entries matching a model version |
| `invalidateByCriteria(criteria)` | `Promise<number>` | Delete all entries matching criteria (walks full keyspace) |
| `getStats()` | `Promise<StorageStats>` | Get approximate entry count from Redis `INFO keyspace` |
| `healthCheck()` | `Promise<HealthStatus>` | Ping Redis and report `{ healthy: boolean }` |

## Usage Patterns

### Custom Key Prefix

```typescript
const adapter = new RedisAdapter({
  url: "redis://localhost:6379",
  keyPrefix: "myapp:cache:",
});
// Keys stored as: myapp:cache:<promptHash>:<generationConfigHash>
```

### Authentication

```typescript
// Password in URL
const adapter = new RedisAdapter({ url: "redis://:mypassword@localhost:6379" });

// TLS
const adapter = new RedisAdapter({ url: "rediss://localhost:6380" });
```

## Performance Notes

- `get()` and `set()` operate at sub-millisecond latency for typical payloads.
- `findByUseCase`, `findByModelVersion`, and `invalidateByCriteria` use `SCAN` and walk the full keyspace — O(N) in cache size. Avoid calling these on hot request paths. Run from background jobs or deploy Redis Stack with RediSearch for indexed metadata queries.
- `setBatch` pipelines operations through a single `MULTI`/`EXEC` block for efficiency.
- This adapter implements exact-match metadata storage only. Semantic search requires a `VectorStorageAdapter` (e.g., `QdrantAdapter`).

## Related Packages

- [`@reaatech/llm-cache`](https://www.npmjs.com/package/@reaatech/llm-cache) — Core caching engine and types
- [`@reaatech/llm-cache-adapters-qdrant`](https://www.npmjs.com/package/@reaatech/llm-cache-adapters-qdrant) — Qdrant vector search adapter (pair with this adapter for full exact + semantic caching)

## License

[MIT](https://github.com/reaatech/llm-cache/blob/main/LICENSE)
