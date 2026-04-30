# llm-cache

[![CI](https://github.com/reaatech/llm-cache/actions/workflows/ci.yml/badge.svg)](https://github.com/reaatech/llm-cache/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)](https://www.typescriptlang.org/)

> Semantic caching layer for LLM calls — embedding-based similarity matching with model-aware fingerprinting, use-case segmentation, adaptive TTL, and cost tracking. Reduce latency, cut API costs, and maintain consistent responses across semantically equivalent prompts.

This monorepo provides the core caching engine, pluggable storage adapters, an HTTP server wrapper, and supporting packages for cost tracking and observability.

## Features

- **Exact-match cache** — SHA-256 hash of the full prompt for sub-millisecond cache hits
- **Semantic cache** — Embed prompts and search for similar entries above a configurable cosine similarity threshold
- **Generation config fingerprinting** — Model, temperature, top_p, system prompt, and tools are hashed so different configurations never collide
- **Multi-adapter storage** — Pluggable backends for metadata (Memory, Redis, DynamoDB) and vector search (Memory, Qdrant)
- **Use-case segmentation** — Isolate caches by use case to prevent cross-contamination
- **Adaptive TTL** — Factual queries expire faster than creative ones; sensitive data gets the shortest TTL
- **Cost tracking** — Built-in pricing for 40+ models across OpenAI, Anthropic, and Google with savings calculation
- **Observability** — Structured JSON logging with automatic PII redaction and Prometheus-compatible metrics
- **Encryption-ready** — AES-256-GCM for prompts, responses, and embeddings at the storage layer
- **HTTP server** — REST API wrapper for polyglot and service-oriented architectures

## Installation

### Using the packages

Packages are published under the `@reaatech` scope and can be installed individually:

```bash
# Core library (required)
pnpm add @reaatech/llm-cache

# Storage adapters (pick what you need)
pnpm add @reaatech/llm-cache-adapters-redis      # Redis for exact-match metadata
pnpm add @reaatech/llm-cache-adapters-dynamodb   # DynamoDB for exact-match metadata
pnpm add @reaatech/llm-cache-adapters-qdrant     # Qdrant for vector search

# Utilities (optional)
pnpm add @reaatech/llm-cache-cost-tracker        # Cost calculation and pricing data
pnpm add @reaatech/llm-cache-observability       # Metrics, logging, and tracing
pnpm add @reaatech/llm-cache-server              # HTTP server wrapper
```

### Contributing

```bash
# Clone the repository
git clone https://github.com/reaatech/llm-cache.git
cd llm-cache

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run the test suite
pnpm test

# Run linting
pnpm lint

# Run type check
pnpm typecheck
```

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
  { choices: [{ message: { content: "A typed superset of JavaScript" } }] },
  { model: "gpt-4", modelVersion: "gpt-4-0613" },
);

// Exact match — < 1ms
const exact = await cache.get("What is TypeScript?", {
  model: "gpt-4",
  modelVersion: "gpt-4-0613",
});
// → { hit: true, type: "exact", entry: {...} }

// Semantic match — < 50ms with Qdrant
const semantic = await cache.get("Tell me about TypeScript", {
  model: "gpt-4",
  modelVersion: "gpt-4-0613",
});
// → { hit: true, type: "semantic", confidence: 0.92, entry: {...} }
```

### Server Usage (Docker)

```bash
docker compose up

curl -X POST http://localhost:3000/cache/get \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is TypeScript?", "options": {"model": "gpt-4", "modelVersion": "gpt-4-0613"}}'
```

See the [`examples/`](examples/) directory for end-to-end examples with Redis, Qdrant, and DynamoDB.

## Packages

| Package | Description |
| ------- | ----------- |
| [`@reaatech/llm-cache`](./packages/core) | Core caching engine, adapters (InMemory), embedder (OpenAI), similarity matcher, and all shared types |
| [`@reaatech/llm-cache-adapters-redis`](./packages/adapters/redis) | Redis storage adapter with automatic TTL, connection pooling, and batch operations |
| [`@reaatech/llm-cache-adapters-dynamodb`](./packages/adapters/dynamodb) | DynamoDB adapter with native TTL, GSIs for metadata queries, and batch operations |
| [`@reaatech/llm-cache-adapters-qdrant`](./packages/adapters/qdrant) | Qdrant vector database adapter for low-latency semantic search via HNSW |
| [`@reaatech/llm-cache-cost-tracker`](./packages/cost-tracker) | Cost calculator with built-in pricing for 40+ models and savings computation |
| [`@reaatech/llm-cache-observability`](./packages/observability) | Structured JSON logger with PII redaction and Prometheus metrics collector |
| [`@reaatech/llm-cache-server`](./packages/server) | HTTP server wrapper with configurable storage and vector adapters |

## Architecture

```
Client
  │
  ▼
CacheEngine
  ├── SHA-256 Hash ──────► StorageAdapter (Redis / DynamoDB / InMemory)
  │                          • Exact-match lookup via fingerprint
  │                          • Metadata storage with TTL
  │
  ├── Embedding ─────────► OpenAIEmbedder (text-embedding-3-small / ada-002)
  │                          • Configurable dimensions and batch size
  │
  └── Semantic Search ───► VectorStorageAdapter (Qdrant / InMemory)
                             • Cosine similarity search
                             • HNSW index for low-latency queries
```

### Lookup Flow

1. **Hash the generation config** — Model, version, temperature, top_p, system prompt, and tools are combined into a fingerprint
2. **Exact match** — Check if an identical prompt exists under the same fingerprint (< 1ms)
3. **Semantic search** — Embed the prompt, query the vector store for similar entries above the configured threshold (< 50ms with Qdrant)
4. **Cache miss** — Forward to your LLM provider, then store the result for future hits

## Configuration

See [`.env.example`](.env.example) for the full annotated configuration reference. Core environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key for embeddings | — |
| `STORAGE_ADAPTER` | Metadata storage backend (`memory`, `redis`, `dynamodb`) | `memory` |
| `VECTOR_STORAGE_ADAPTER` | Vector search backend (`memory`, `qdrant`) | `memory` |
| `SIMILARITY_THRESHOLD` | Cosine similarity threshold (0.0–1.0) | `0.8` |
| `TTL_DEFAULT` | Default cache TTL in seconds | `3600` |
| `LLM_CACHE_API_KEY` | API key for server authentication | — |
| `PORT` | HTTP server port | `3000` |

## Operational Notes

- **DynamoDB TTL** — Enable native TTL on the `expiresAtEpoch` attribute (override via the `ttlAttribute` adapter option).
- **Qdrant eviction** — The adapter does not auto-evict expired points. Run `cache.invalidate({ olderThan })` periodically.
- **Server authentication** — Set `LLM_CACHE_API_KEY` before exposing the server beyond a trusted network.
- **Pricing data** — Pricing in `@reaatech/llm-cache-cost-tracker` is provided as reference and may lag provider price changes.
- **Redis SCAN queries** — `findByUseCase`, `findByModelVersion`, and `invalidateByCriteria` walk the keyspace via `SCAN` (O(N)). Avoid calling on hot paths.

## Project Structure

```
llm-cache/
├── packages/
│   ├── core/                  # CacheEngine, types, InMemoryAdapter, OpenAIEmbedder
│   ├── adapters/
│   │   ├── redis/             # Redis storage adapter
│   │   ├── dynamodb/          # DynamoDB storage adapter
│   │   └── qdrant/            # Qdrant vector storage adapter
│   ├── cost-tracker/          # Cost calculation and pricing data
│   ├── observability/         # Logging, metrics, tracing
│   └── server/                # HTTP server wrapper
├── examples/                  # Usage examples (basic, Redis, Qdrant)
├── skills/                    # AI agent development skills
├── docker-compose.yml         # Local development stack (Qdrant + Redis + server)
├── tsconfig.json              # Root TypeScript configuration
├── pnpm-workspace.yaml        # pnpm workspace definition
└── .github/workflows/         # CI/CD pipelines
```

## Documentation

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — System design, data flow, and component interfaces
- [`DEV_PLAN.md`](DEV_PLAN.md) — Development roadmap and milestones
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — Contribution workflow and release process
- [`AGENTS.md`](AGENTS.md) — AI agent development framework and skill definitions
- [`SECURITY.md`](SECURITY.md) — Vulnerability reporting and security best practices

## License

[MIT](LICENSE)
