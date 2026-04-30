# @reaatech/llm-cache

[![npm version](https://img.shields.io/npm/v/@reaatech/llm-cache.svg)](https://www.npmjs.com/package/@reaatech/llm-cache)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/llm-cache/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/llm-cache/ci.yml?branch=main&label=CI)](https://github.com/reaatech/llm-cache/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Canonical caching engine for LLM calls — semantic and exact-match caching with embedding-based similarity matching, model-aware fingerprinting, use-case segmentation, and adaptive TTL.

## Installation

```bash
npm install @reaatech/llm-cache
# or
pnpm add @reaatech/llm-cache
```

## Feature Overview

- **Exact-match cache** — SHA-256 hash of the full prompt for sub-millisecond cache hits
- **Semantic cache** — Embed prompts and search for similar cached entries above a configurable cosine similarity threshold
- **Generation config fingerprinting** — Model, temperature, top_p, system prompt, and tools are hashed so different configurations never collide
- **Use-case segmentation** — Isolate caches by use case to prevent cross-contamination (e.g., summarization vs. classification)
- **Adaptive TTL** — Different TTLs for factual, creative, analytical, and sensitive data
- **Cost-aware** — Optional `CostCalculatorLike` integration for tracking savings per cache hit
- **Encryption-ready** — Pluggable `EncryptionService` for encrypting prompts, responses, and embeddings at the storage layer
- **Zod-validated config** — `CacheConfigSchema` validates the full configuration object at startup

## Quick Start

```typescript
import { CacheEngine, InMemoryAdapter, OpenAIEmbedder } from "@reaatech/llm-cache";

const cache = new CacheEngine({
  storage: new InMemoryAdapter(),
  vectorStorage: new InMemoryAdapter(),
  embedder: new OpenAIEmbedder({
    provider: "openai",
    model: "text-embedding-3-small",
    dimensions: 1536,
    apiKey: process.env.OPENAI_API_KEY,
  }),
  config: {
    storage: { adapter: "memory" },
    vectorStorage: { adapter: "memory" },
    embedding: {
      provider: "openai",
      model: "text-embedding-3-small",
      dimensions: 1536,
      batchSize: 100,
      maxRetries: 3,
    },
    similarity: { threshold: 0.8, metric: "cosine", maxResults: 10 },
    ttl: {
      default: 3600,
      factual: 1800,
      creative: 7200,
      analytical: 3600,
      sensitive: 600,
      byUseCase: {},
    },
    segmentation: { enabled: true, defaultUseCase: "general" },
    cost: { enabled: true, currency: "USD" },
    observability: { metrics: true, tracing: false, logging: "info" },
  },
});

// Store a response
await cache.set(
  "What is TypeScript?",
  { answer: "A typed superset of JavaScript" },
  { model: "gpt-4", modelVersion: "gpt-4-0613" },
);

// Exact match — < 1ms
const exact = await cache.get("What is TypeScript?", {
  model: "gpt-4",
  modelVersion: "gpt-4-0613",
});
// → { hit: true, type: "exact", entry: {...} }

// Semantic match — uses embedding similarity
const semantic = await cache.get("Tell me about TypeScript", {
  model: "gpt-4",
  modelVersion: "gpt-4-0613",
});
// → { hit: true, type: "semantic", confidence: 0.92, entry: {...} }
```

## API Reference

### `CacheEngine`

The main caching orchestrator. Performs multi-stage lookup: exact match → semantic search → cache miss.

```typescript
import { CacheEngine } from "@reaatech/llm-cache";

const engine = new CacheEngine({ storage, vectorStorage, embedder, config });
```

#### `CacheEngineDependencies`

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `storage` | `StorageAdapter` | Yes | Exact-match metadata store (e.g., `InMemoryAdapter`, `RedisAdapter`, `DynamoDBAdapter`) |
| `vectorStorage` | `VectorStorageAdapter` | Yes | Vector search store for semantic matching (e.g., `InMemoryAdapter`, `QdrantAdapter`) |
| `embedder` | `EmbeddingProvider` | Yes | Embedding generation (e.g., `OpenAIEmbedder`) |
| `config` | `CacheConfig` | Yes | Full cache configuration (Zod-validated) |
| `costCalculator` | `CostCalculatorLike` | No | Optional cost tracking integration |
| `encryptionService` | `EncryptionService` | No | Optional encryption for prompts/responses/embeddings |

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `get(prompt, options?)` | `Promise<CacheResult>` | Look up a prompt: exact → semantic → miss |
| `set(prompt, response, options?, metadata?)` | `Promise<CacheEntry>` | Store a response and its embedding |
| `invalidate(criteria)` | `Promise<InvalidateResult>` | Delete entries matching criteria (useCase, modelVersion, olderThan, etc.) |
| `healthCheck()` | `Promise<{ storage: HealthStatus; vectorStorage: HealthStatus }>` | Check storage and vector backend health |

### `CacheOptions`

| Property | Type | Description |
|----------|------|-------------|
| `useCase` | `string` | Cache segment namespace |
| `model` | `string` | Model identifier |
| `modelVersion` | `string` | Specific model version |
| `generationConfigHash` | `string` | Pre-computed fingerprint (auto-generated if omitted) |
| `temperature` | `number` | Sampling temperature (affects fingerprint) |
| `topP` | `number` | Nucleus sampling parameter (affects fingerprint) |
| `maxTokens` | `number` | Max completion tokens (affects fingerprint) |
| `systemPrompt` | `string` | System prompt (affects fingerprint) |
| `tools` | `unknown[]` | Tool definitions (affect fingerprint) |
| `responseFormat` | `"text" \| "json_object" \| "json_schema"` | Response format (affects fingerprint) |

### `CacheResult`

A discriminated union returned by `get()`:

```typescript
type CacheResult =
  | { hit: true; type: "exact" | "semantic"; entry: CacheEntry; confidence?: number; similarity?: number; cachedAt: Date; age: number }
  | { hit: false; reason: "not_found" | "below_threshold" | "expired" | "dimension_mismatch" };
```

### `CacheMetadata`

Pass to `set()` to control TTL, sensitivity, and token tracking:

| Property | Type | Description |
|----------|------|-------------|
| `queryType` | `"factual" \| "creative" \| "analytical"` | Determines TTL from config |
| `ttl` | `number` | Override TTL in seconds |
| `sensitive` | `boolean` | Mark entry for encryption and shorter TTL |
| `tokens` | `{ prompt: number; completion: number }` | Token usage for cost calculation |

### `InvalidationCriteria`

| Property | Type | Description |
|----------|------|-------------|
| `useCase` | `string` | Invalidate all entries in a use case |
| `modelVersion` | `string` | Invalidate by model version |
| `generationConfigHash` | `string` | Invalidate by fingerprint |
| `embeddingModel` | `string` | Invalidate by embedding model |
| `olderThan` | `Date` | Invalidate entries created before this time |
| `promptHash` | `string` | Invalidate a specific prompt hash |

### Adapters & Embedder

| Export | Description |
|--------|-------------|
| `InMemoryAdapter` | In-memory storage/vector adapter with LRU eviction and TTL cleanup |
| `OpenAIEmbedder` | OpenAI embedding provider with batch processing and retry |
| `SimilarityMatcher` | Cosine similarity matcher with configurable threshold |

### Config

| Export | Description |
|--------|-------------|
| `CacheConfig` | TypeScript interface for the full configuration tree |
| `CacheConfigSchema` | Zod schema — use `safeParse` to validate at startup |

### Utility Functions

| Export | Description |
|--------|-------------|
| `buildPromptHash(prompt)` | SHA-256 hex hash of a prompt string |
| `buildCacheFingerprint(options)` | SHA-256 hash of the generation configuration |
| `buildExactMatchKey(options)` | Composite key: `promptHash:generationConfigHash` |

### Encryption

| Export | Description |
|--------|-------------|
| `EncryptionService` | AES-256-GCM encryption for prompts, responses, and embeddings |
| `EncryptedPayload` | Type for the encrypted output (`{ ciphertext, iv, tag }`) |

## Usage Patterns

### Use Case Segmentation

```typescript
// Each use case has an isolated cache namespace
await cache.set("classify: spam", { label: "spam" }, {
  model: "gpt-4",
  modelVersion: "gpt-4-0613",
  useCase: "classification",
});

// Same prompt in a different use case will miss
const result = await cache.get("classify: spam", {
  model: "gpt-4",
  modelVersion: "gpt-4-0613",
  useCase: "summarization",
});
// → { hit: false, reason: "not_found" }
```

### Sensitive Data Handling

```typescript
const entry = await cache.set(
  "Patient: John Doe, SSN: 123-45-6789",
  response,
  { model: "gpt-4", modelVersion: "gpt-4-0613" },
  { sensitive: true, ttl: 600 },
);
// Entry gets the config's `sensitive` TTL (600s default)
// Encryption is applied if encryptionService is configured
```

### Model Rotation

```typescript
// After upgrading from gpt-4 to gpt-4-turbo, invalidate old entries
const removed = await cache.invalidate({ modelVersion: "gpt-4-0613" });
console.log(`Cleared ${removed.total} old model entries`);

// New requests with gpt-4-turbo will generate fresh cache entries
const result = await cache.get(prompt, {
  model: "gpt-4",
  modelVersion: "gpt-4-turbo",
});
```

## Related Packages

- [`@reaatech/llm-cache-adapters-redis`](https://www.npmjs.com/package/@reaatech/llm-cache-adapters-redis) — Redis storage adapter
- [`@reaatech/llm-cache-adapters-dynamodb`](https://www.npmjs.com/package/@reaatech/llm-cache-adapters-dynamodb) — DynamoDB storage adapter
- [`@reaatech/llm-cache-adapters-qdrant`](https://www.npmjs.com/package/@reaatech/llm-cache-adapters-qdrant) — Qdrant vector search adapter
- [`@reaatech/llm-cache-cost-tracker`](https://www.npmjs.com/package/@reaatech/llm-cache-cost-tracker) — Cost calculation and pricing data
- [`@reaatech/llm-cache-observability`](https://www.npmjs.com/package/@reaatech/llm-cache-observability) — Structured logging and Prometheus metrics
- [`@reaatech/llm-cache-server`](https://www.npmjs.com/package/@reaatech/llm-cache-server) — HTTP server wrapper

## License

[MIT](https://github.com/reaatech/llm-cache/blob/main/LICENSE)
