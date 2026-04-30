# @reaatech/llm-cache-server

[![npm version](https://img.shields.io/npm/v/@reaatech/llm-cache-server.svg)](https://www.npmjs.com/package/@reaatech/llm-cache-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/llm-cache/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/llm-cache/ci.yml?branch=main&label=CI)](https://github.com/reaatech/llm-cache/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

HTTP server wrapper for llm-cache providing a REST API for cache operations, Prometheus metrics, and health endpoints. Supports multiple storage and vector adapter backends via environment variables — deploy as a sidecar or centralized caching service.

## Installation

```bash
npm install @reaatech/llm-cache-server
# or
pnpm add @reaatech/llm-cache-server
```

## Feature Overview

- **REST API** — JSON endpoints for `get`, `set`, and `invalidate` cache operations
- **Pluggable storage** — switch between `memory`, `redis`, and `dynamodb` via `STORAGE_ADAPTER`
- **Pluggable vector search** — switch between `memory` and `qdrant` via `VECTOR_STORAGE_ADAPTER`
- **API key authentication** — Bearer token auth via `LLM_CACHE_API_KEY` (constant-time comparison)
- **Prometheus metrics** — `GET /metrics` returns Prometheus text exposition format
- **Health probes** — `GET /health` (liveness) and `GET /ready` (readiness with storage checks)
- **Correlation ID** — every response carries `X-Correlation-Id` for distributed tracing
- **Configurable body limit** — `MAX_BODY_BYTES` caps incoming request size

## Quick Start

### CLI

```bash
export LLM_CACHE_API_KEY=my-secret-key
export OPENAI_API_KEY=sk-...
export STORAGE_ADAPTER=redis
export REDIS_URL=redis://localhost:6379
export VECTOR_STORAGE_ADAPTER=qdrant
export QDRANT_URL=http://localhost:6333

npx @reaatech/llm-cache-server
# → llm-cache server listening on port 3000
```

### Docker

```bash
docker compose up
```

### Programmatic

```typescript
import { createApp, main } from "@reaatech/llm-cache-server";

// Option A: start the default server
main().catch(console.error);

// Option B: create the app and customize
const app = await createApp();
app.server.listen(3000, () => console.log("Listening on :3000"));

// Graceful shutdown
process.on("SIGTERM", () => app.shutdown().then(() => process.exit(0)));
```

## API Reference

### `createApp(): Promise<App>`

Creates a fully configured HTTP server with cache engine, storage adapters, and embedder. Configuration is loaded from environment variables via `loadConfig()`.

```typescript
import { createApp } from "@reaatech/llm-cache-server";

const app = await createApp();
```

#### `App`

| Property | Type | Description |
|----------|------|-------------|
| `server` | `http.Server` | Node.js HTTP server |
| `cache` | `CacheEngine` | The configured cache engine instance |
| `shutdown` | `() => Promise<void>` | Graceful shutdown — closes server and storage connections |

### `main(): Promise<void>`

Convenience function that calls `createApp()`, starts listening on the configured port, and registers `SIGTERM`/`SIGINT` handlers for graceful shutdown.

### `loadConfig(): ServerConfig`

Loads and validates configuration from environment variables. Returns the full `ServerConfig` object.

```typescript
import { loadConfig } from "@reaatech/llm-cache-server";

const config = loadConfig();
// → { port: 3000, storageAdapter: "redis", vectorStorageAdapter: "qdrant", ... }
```

### `ServerConfig`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `port` | `number` | `3000` | HTTP server port |
| `storageAdapter` | `"memory" \| "redis" \| "dynamodb"` | `"memory"` | Exact-match storage backend |
| `vectorStorageAdapter` | `"memory" \| "qdrant"` | `"memory"` | Semantic search backend |
| `redisUrl` | `string` | — | Redis connection URL |
| `dynamodbRegion` | `string` | — | AWS region for DynamoDB |
| `dynamodbTable` | `string` | — | DynamoDB table name |
| `dynamodbEndpoint` | `string` | — | DynamoDB endpoint override |
| `qdrantUrl` | `string` | — | Qdrant server URL |
| `qdrantCollection` | `string` | — | Qdrant collection name |
| `qdrantApiKey` | `string` | — | Qdrant API key |
| `openaiApiKey` | `string` | (required) | OpenAI API key for embeddings |
| `openaiOrganization` | `string` | — | OpenAI organization ID |
| `apiKey` | `string` | — | Bearer token for server authentication |
| `maxBodyBytes` | `number` | `1048576` | Max request body size in bytes |
| `cacheConfig` | `CacheConfig` | (see env vars) | Full cache configuration object |

### REST Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Liveness probe — always returns 200 |
| `GET` | `/ready` | No | Readiness probe — checks storage and vector backend health |
| `POST` | `/cache/get` | Yes | Lookup a prompt; returns `CacheResult` |
| `POST` | `/cache/set` | Yes | Store a response; returns `{ id, cached }` |
| `POST` | `/cache/invalidate` | Yes | Invalidate cache entries by criteria |
| `GET` | `/metrics` | Yes | Prometheus text or JSON metrics snapshot |
| `GET` | `/stats` | Yes | Storage and vector adapter stats |

### `POST /cache/get`

```json
{
  "prompt": "What is TypeScript?",
  "options": {
    "model": "gpt-4",
    "modelVersion": "gpt-4-0613",
    "useCase": "qa"
  }
}
```

Response (hit):
```json
{ "hit": true, "type": "exact", "entry": { /* CacheEntry */ }, "confidence": 1.0 }
```

### `POST /cache/set`

```json
{
  "prompt": "What is TypeScript?",
  "response": { "choices": [{ "message": { "content": "A typed superset of JavaScript" } }] },
  "options": { "model": "gpt-4", "modelVersion": "gpt-4-0613" },
  "metadata": { "queryType": "factual", "tokens": { "prompt": 10, "completion": 20 } }
}
```

### `POST /cache/invalidate`

```json
{
  "criteria": { "useCase": "qa", "modelVersion": "gpt-4-0613" }
}
```

Response:
```json
{ "total": 42, "storage": 42, "vectorStorage": 0 }
```

## Environment Variables

All environment variables used by the server. See [`.env.example`](../../.env.example) for the complete annotated reference.

| Variable | Required | Default | Adapters |
|----------|----------|---------|----------|
| `PORT` | No | `3000` | All |
| `LLM_CACHE_API_KEY` | No | — | All (enables auth) |
| `MAX_BODY_BYTES` | No | `1048576` | All |
| `OPENAI_API_KEY` | Yes | — | All |
| `OPENAI_ORGANIZATION` | No | — | All |
| `STORAGE_ADAPTER` | No | `memory` | `redis`, `dynamodb` |
| `REDIS_URL` | Conditional | — | Redis |
| `DYNAMODB_REGION` | Conditional | — | DynamoDB |
| `DYNAMODB_TABLE` | Conditional | — | DynamoDB |
| `DYNAMODB_ENDPOINT` | No | — | DynamoDB |
| `VECTOR_STORAGE_ADAPTER` | No | `memory` | `qdrant` |
| `QDRANT_URL` | Conditional | — | Qdrant |
| `QDRANT_COLLECTION` | No | `llm-cache` | Qdrant |
| `QDRANT_API_KEY` | No | — | Qdrant |
| `SIMILARITY_THRESHOLD` | No | `0.8` | All |
| `SIMILARITY_MAX_RESULTS` | No | `10` | All |
| `TTL_DEFAULT` | No | `3600` | All |
| `TTL_FACTUAL` | No | `1800` | All |
| `TTL_CREATIVE` | No | `7200` | All |
| `TTL_ANALYTICAL` | No | `3600` | All |
| `TTL_SENSITIVE` | No | `600` | All |
| `LOG_LEVEL` | No | `info` | All |
| `METRICS_ENABLED` | No | `true` | All |

## Usage Patterns

### Authentication

Set `LLM_CACHE_API_KEY` to require Bearer token authentication on all `/cache/*` and `/metrics` endpoints. The comparison is constant-time to prevent timing attacks. Endpoints `/health` and `/ready` remain public.

```bash
export LLM_CACHE_API_KEY=my-secret-key

curl -X POST http://localhost:3000/cache/get \
  -H "Authorization: Bearer my-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is TypeScript?"}'
```

### Redis + Qdrant (Production)

```bash
export STORAGE_ADAPTER=redis
export REDIS_URL=redis://:password@redis.internal:6379
export VECTOR_STORAGE_ADAPTER=qdrant
export QDRANT_URL=http://qdrant.internal:6333
export QDRANT_COLLECTION=llm-cache
export OPENAI_API_KEY=sk-...

npx @reaatech/llm-cache-server
```

### DynamoDB + In-Memory Vector (Testing)

```bash
export STORAGE_ADAPTER=dynamodb
export DYNAMODB_REGION=us-east-1
export DYNAMODB_TABLE=llm-cache
export DYNAMODB_ENDPOINT=http://localhost:8000
export VECTOR_STORAGE_ADAPTER=memory
export OPENAI_API_KEY=sk-...

npx @reaatech/llm-cache-server
```

### Docker Compose

The project's `docker-compose.yml` starts Qdrant, Redis, and the cache server:

```bash
docker compose up

# Health check
curl http://localhost:3000/health
# → { "status": "ok", "timestamp": "..." }
```

## Related Packages

- [`@reaatech/llm-cache`](https://www.npmjs.com/package/@reaatech/llm-cache) — Core caching engine
- [`@reaatech/llm-cache-adapters-redis`](https://www.npmjs.com/package/@reaatech/llm-cache-adapters-redis) — Redis storage adapter
- [`@reaatech/llm-cache-adapters-dynamodb`](https://www.npmjs.com/package/@reaatech/llm-cache-adapters-dynamodb) — DynamoDB storage adapter
- [`@reaatech/llm-cache-adapters-qdrant`](https://www.npmjs.com/package/@reaatech/llm-cache-adapters-qdrant) — Qdrant vector search adapter
- [`@reaatech/llm-cache-observability`](https://www.npmjs.com/package/@reaatech/llm-cache-observability) — Metrics and logging

## License

[MIT](https://github.com/reaatech/llm-cache/blob/main/LICENSE)
