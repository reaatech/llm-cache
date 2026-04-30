# @reaatech/llm-cache-adapters-dynamodb

[![npm version](https://img.shields.io/npm/v/@reaatech/llm-cache-adapters-dynamodb.svg)](https://www.npmjs.com/package/@reaatech/llm-cache-adapters-dynamodb)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/llm-cache/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/llm-cache/ci.yml?branch=main&label=CI)](https://github.com/reaatech/llm-cache/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

DynamoDB storage adapter for llm-cache exact-match metadata. Provides serverless, scalable persistence with native DynamoDB TTL, GSI-based metadata queries, and batch operations chunked to AWS limits.

## Installation

```bash
npm install @reaatech/llm-cache-adapters-dynamodb
# or
pnpm add @reaatech/llm-cache-adapters-dynamodb
```

## Feature Overview

- **Native DynamoDB TTL** — writes an epoch-second attribute (`expiresAtEpoch` by default) for automatic row expiration
- **GSI-backed queries** — `gsi1` indexes `useCase`, `gsi2` indexes `modelVersion` for efficient metadata queries
- **Batch operations** — `getBatch`, `setBatch`, and `deleteBatch` chunked to DynamoDB's 25-item limit
- **Paginated invalidation** — `invalidateByCriteria` uses GSI queries when possible, falling back to `Scan` for broad criteria
- **Stats** — `getStats()` returns item count and table size from `DescribeTable`
- **Health check** — `healthCheck()` runs a lightweight `Scan` (limit 1)

## Quick Start

```typescript
import { CacheEngine, OpenAIEmbedder } from "@reaatech/llm-cache";
import { DynamoDBAdapter } from "@reaatech/llm-cache-adapters-dynamodb";

const storage = new DynamoDBAdapter({
  region: "us-east-1",
  tableName: "llm-cache",
});

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

## Table Schema

Your DynamoDB table must have these attributes and indexes:

| Attribute | Type | Key | Description |
|-----------|------|-----|-------------|
| `pk` | String | HASH | Exact-match key (`promptHash:generationConfigHash`) |
| `gsi1pk` | String | GSI1 HASH | `USECASE#<useCase>` for useCase queries |
| `gsi1sk` | String | GSI1 RANGE | `modelVersion#generationConfigHash` |
| `gsi2pk` | String | GSI2 HASH | `MODEL#<modelVersion>` for model queries |
| `gsi2sk` | String | GSI2 RANGE | `useCase#createdAt` |
| `expiresAtEpoch` | Number | (TTL) | Epoch seconds for native DynamoDB TTL |

Enable TTL on the `expiresAtEpoch` attribute (or your custom `ttlAttribute` name) in the DynamoDB console.

## API Reference

### `DynamoDBAdapter` (class)

Implements `StorageAdapter` from `@reaatech/llm-cache`.

```typescript
import { DynamoDBAdapter } from "@reaatech/llm-cache-adapters-dynamodb";

const adapter = new DynamoDBAdapter({
  region: "us-east-1",
  tableName: "llm-cache",
});
```

#### `DynamoDBAdapterConfig`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `region` | `string` | (required) | AWS region |
| `tableName` | `string` | (required) | DynamoDB table name |
| `endpoint` | `string` | — | Override endpoint (e.g., DynamoDB Local: `http://localhost:8000`) |
| `ttlAttribute` | `string` | `"expiresAtEpoch"` | Attribute name for native DynamoDB TTL |

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `get(key)` | `Promise<CacheEntry \| null>` | Retrieve and deserialize a cache entry (auto-deletes if expired) |
| `set(key, entry)` | `Promise<void>` | Store an entry with native TTL epoch attribute |
| `delete(key)` | `Promise<boolean>` | Remove a key |
| `exists(key)` | `Promise<boolean>` | Check if a key exists (reads then checks expiry) |
| `getBatch(keys)` | `Promise<(CacheEntry \| null)[]>` | Batch retrieve via `BatchGetCommand` |
| `setBatch(items)` | `Promise<void>` | Batch store chunked at 25 items per `BatchWriteCommand` |
| `deleteBatch(keys)` | `Promise<number>` | Batch delete chunked at 25 keys per `BatchWriteCommand` |
| `findByUseCase(useCase, limit?)` | `Promise<CacheEntry[]>` | Query GSI1 for entries by use case |
| `findByModelVersion(modelVersion, limit?)` | `Promise<CacheEntry[]>` | Query GSI2 for entries by model version |
| `invalidateByCriteria(criteria)` | `Promise<number>` | Delete matching entries — uses GSI when possible |
| `getStats()` | `Promise<StorageStats>` | Get `ItemCount` and `TableSizeBytes` from `DescribeTable` |
| `healthCheck()` | `Promise<HealthStatus>` | Run a limit-1 `Scan` and report status |

## Usage Patterns

### Local Development with DynamoDB Local

```typescript
const adapter = new DynamoDBAdapter({
  region: "us-east-1",
  tableName: "llm-cache",
  endpoint: "http://localhost:8000",
});
```

### Custom TTL Attribute

```typescript
const adapter = new DynamoDBAdapter({
  region: "us-east-1",
  tableName: "llm-cache",
  ttlAttribute: "ttl", // Match your table's TTL attribute name
});
```

### IAM Credentials

The adapter uses the AWS SDK credential chain. Configure via environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`), IAM roles (EC2, ECS, Lambda), or `~/.aws/credentials`.

## Notes

- Semantic search requires a separate vector database (e.g., Qdrant). DynamoDB does not support native vector similarity search.
- Batch writes (`setBatch`, `deleteBatch`) are automatically chunked to DynamoDB's 25-item limit across multiple requests.
- `invalidateByCriteria` prefers GSI-indexed criteria (`useCase`, `modelVersion`). Broad invalidation (e.g., `olderThan` only) falls back to a full table `Scan`.

## Related Packages

- [`@reaatech/llm-cache`](https://www.npmjs.com/package/@reaatech/llm-cache) — Core caching engine and types
- [`@reaatech/llm-cache-adapters-qdrant`](https://www.npmjs.com/package/@reaatech/llm-cache-adapters-qdrant) — Qdrant vector search adapter

## License

[MIT](https://github.com/reaatech/llm-cache/blob/main/LICENSE)
