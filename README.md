# llm-cache

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.0-blue" alt="version">
  <a href="https://github.com/reaatech/llm-cache/actions"><img src="https://img.shields.io/badge/ci-passing-brightgreen" alt="CI"></a>
  <a href="https://github.com/reaatech/llm-cache/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen" alt="node">
  <img src="https://img.shields.io/badge/pnpm-%3E%3D8.0.0-orange" alt="pnpm">
</p>

Semantic caching layer for LLM calls — embedding-based similarity matching, not exact-match alone. Reduce latency, cut API costs, and maintain consistent responses across semantically equivalent prompts.

## Features

- **Exact-match cache** — SHA-256 hash of the full prompt for zero-latency cache hits
- **Semantic cache** — Embed prompts and search for similar cached entries above a configurable cosine similarity threshold
- **Cache fingerprinting** — Model, temperature, top_p, system prompt, and tools are hashed together so different generation configurations never collide
- **Multi-adapter storage** — Pluggable backends for metadata (Memory, Redis, DynamoDB) and vector search (Memory, Qdrant)
- **Use case segmentation** — Isolate caches by use case (e.g., summarization vs. classification) to prevent cross-contamination
- **Cost tracking** — Built-in pricing for 40+ models across OpenAI, Anthropic, and Google; calculate dollars saved per cache hit
- **Adaptive TTL** — Factual queries expire faster than creative ones; sensitive data gets the shortest TTL
- **Observability** — Structured JSON logging, Prometheus-compatible metrics, and optional distributed tracing support
- **Encryption-ready** — AES-256-GCM for prompts, responses, and embeddings at the storage layer
- **HTTP server** — Optional REST API wrapper for polyglot and service-oriented architectures

## Installation

```bash
# Core library (required)
pnpm add @llm-cache/core

# Storage adapters (optional — pick what you need)
pnpm add @llm-cache/adapters-redis      # Redis for exact-match metadata
pnpm add @llm-cache/adapters-dynamodb   # DynamoDB for exact-match metadata
pnpm add @llm-cache/adapters-qdrant     # Qdrant for vector search

# Utilities (optional)
pnpm add @llm-cache/cost-tracker        # Cost calculation and pricing data
pnpm add @llm-cache/observability       # Metrics, logging, and tracing
pnpm add @llm-cache/server              # HTTP server wrapper
```

**Requirements:** Node.js >= 20.0.0, pnpm >= 8.0.0

## Quick Start

### Library Usage

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

// Store a response
await cache.set(
  'What is TypeScript?',
  { choices: [{ message: { content: 'A typed superset of JavaScript' } }] },
  { model: 'gpt-4', modelVersion: 'gpt-4-0613' },
);

// Exact match — < 1ms
const exact = await cache.get('What is TypeScript?', {
  model: 'gpt-4',
  modelVersion: 'gpt-4-0613',
});
// { hit: true, type: 'exact', entry: {...} }

// Semantic match — < 50ms with Qdrant
const semantic = await cache.get('Tell me about TypeScript', {
  model: 'gpt-4',
  modelVersion: 'gpt-4-0613',
});
// { hit: true, type: 'semantic', confidence: 0.92, entry: {...} }

// Miss — forward to your LLM provider, then cache the response
const miss = await cache.get('What is Rust?', {
  model: 'gpt-4',
  modelVersion: 'gpt-4-0613',
});
// { hit: false }
```

### Server Usage (Docker)

```bash
# Start Qdrant + Redis + cache server
docker compose up

# Check cache
curl -X POST http://localhost:3000/cache/get \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "What is TypeScript?", "options": {"model": "gpt-4", "modelVersion": "gpt-4-0613"}}'

# Store a response
curl -X POST http://localhost:3000/cache/set \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "What is TypeScript?", "response": {"choices": [{"message": {"content": "A typed superset of JavaScript"}}]}, "options": {"model": "gpt-4", "modelVersion": "gpt-4-0613"}}'
```

For end-to-end examples with Redis, Qdrant, and DynamoDB, see the [`examples/`](examples/) directory.

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

## Packages

| Package | npm | Description |
|---|---|---|
| `@llm-cache/core` | [![npm](https://img.shields.io/badge/npm-core-blue)](https://www.npmjs.com/package/@llm-cache/core) | CacheEngine, adapters (InMemory), embedder (OpenAI), similarity matcher, and all shared types |
| `@llm-cache/adapters-redis` | [![npm](https://img.shields.io/badge/npm-redis-blue)](https://www.npmjs.com/package/@llm-cache/adapters-redis) | Redis storage adapter with connection pooling, SETEX TTL, and key-space scanning |
| `@llm-cache/adapters-dynamodb` | [![npm](https://img.shields.io/badge/npm-dynamodb-blue)](https://www.npmjs.com/package/@llm-cache/adapters-dynamodb) | DynamoDB adapter with native TTL, GSIs for useCase and modelVersion queries, batch operations |
| `@llm-cache/adapters-qdrant` | [![npm](https://img.shields.io/badge/npm-qdrant-blue)](https://www.npmjs.com/package/@llm-cache/adapters-qdrant) | Qdrant vector database adapter for low-latency semantic search via HNSW |
| `@llm-cache/cost-tracker` | [![npm](https://img.shields.io/badge/npm-cost--tracker-blue)](https://www.npmjs.com/package/@llm-cache/cost-tracker) | Cost calculator with built-in pricing for 40+ models (OpenAI, Anthropic, Google) |
| `@llm-cache/observability` | [![npm](https://img.shields.io/badge/npm-observability-blue)](https://www.npmjs.com/package/@llm-cache/observability) | Structured JSON logger, Prometheus metrics collector, optional tracing hooks |
| `@llm-cache/server` | [![npm](https://img.shields.io/badge/npm-server-blue)](https://www.npmjs.com/package/@llm-cache/server) | HTTP server wrapper with configurable storage and vector adapters |

## Configuration

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI API key for embeddings | — |
| `OPENAI_ORGANIZATION` | OpenAI organization ID (optional) | — |
| `EMBEDDING_PROVIDER` | Embedding provider (`openai`) | `openai` |
| `OPENAI_EMBEDDING_MODEL` | Embedding model name | `text-embedding-3-small` |
| `OPENAI_EMBEDDING_DIMENSIONS` | Embedding vector dimensions | `1536` |
| `EMBEDDING_BATCH_SIZE` | Max prompts per embedding API call | `100` |
| `EMBEDDING_MAX_RETRIES` | Max retries on embedding API failures | `3` |
| `STORAGE_ADAPTER` | Metadata storage backend | `memory` |
| `REDIS_URL` | Redis connection URL (e.g. `redis://localhost:6379`) | — |
| `DYNAMODB_REGION` | AWS region for DynamoDB | — |
| `DYNAMODB_TABLE` | DynamoDB table name | — |
| `DYNAMODB_ENDPOINT` | DynamoDB endpoint override (local dev) | — |
| `VECTOR_STORAGE_ADAPTER` | Vector search backend | `memory` |
| `QDRANT_URL` | Qdrant server URL | — |
| `QDRANT_COLLECTION` | Qdrant collection name | `llm-cache` |
| `QDRANT_API_KEY` | Qdrant API key (optional) | — |
| `SIMILARITY_THRESHOLD` | Cosine similarity threshold (0.0–1.0) | `0.8` |
| `SIMILARITY_MAX_RESULTS` | Max results from semantic search | `10` |
| `TTL_DEFAULT` | Default cache TTL in seconds | `3600` |
| `TTL_FACTUAL` | TTL for factual queries | `1800` |
| `TTL_CREATIVE` | TTL for creative queries | `7200` |
| `TTL_ANALYTICAL` | TTL for analytical queries | `3600` |
| `TTL_SENSITIVE` | TTL for sensitive data | `600` |
| `SEGMENTATION_ENABLED` | Enable use-case-based cache isolation | `true` |
| `DEFAULT_USE_CASE` | Default use case when none specified | `general` |
| `COST_TRACKING_ENABLED` | Enable cost savings calculation | `true` |
| `COST_CURRENCY` | Currency for cost reporting | `USD` |
| `METRICS_ENABLED` | Enable Prometheus metrics collection | `true` |
| `TRACING_ENABLED` | Enable distributed tracing hooks | `false` |
| `LOG_LEVEL` | Log level (`error`, `warn`, `info`, `debug`) | `info` |
| `LLM_CACHE_API_KEY` | API key for server authentication | — |
| `PORT` | HTTP server port | `3000` |
| `MAX_BODY_BYTES` | Max request body size (bytes) | `1048576` |

See [`.env.example`](.env.example) for the full annotated configuration reference.

### Similarity Threshold Tuning

| Threshold | Behavior | Recommended For |
|---|---|---|
| `0.95+` | Near-identical matches only | Strict fact retrieval, legal text |
| `0.85–0.94` | Close paraphrases | Q&A, documentation search |
| `0.75–0.84` | Semantically related | Summarization, creative writing |
| `0.70–0.74` | Loosely related | Brainstorming, exploration |

## Operational Notes

- **DynamoDB TTL** — Enable native TTL on the `expiresAtEpoch` attribute (override via the `ttlAttribute` adapter option). Without it, expired rows accumulate indefinitely.
- **Qdrant eviction** — The adapter does not auto-evict expired points. Run `cache.invalidate({ olderThan })` periodically to clean up.
- **Server authentication** — Set `LLM_CACHE_API_KEY` before exposing the server beyond a trusted network. Without it, all `/cache/*` endpoints are unauthenticated.
- **Pricing data** — Pricing in `@llm-cache/cost-tracker` is provided as reference and may lag provider price changes. Verify against your provider before relying on it for billing.
- **Redis SCAN queries** — `findByUseCase`, `findByModelVersion`, and `invalidateByCriteria` walk the keyspace via `SCAN` (O(N)). Avoid calling them on hot paths; run from background jobs or deploy Redis Stack with RediSearch.

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run tests for a specific package
pnpm --filter @llm-cache/core test

# Lint all packages
pnpm lint
pnpm lint:fix

# Type-check all packages
pnpm typecheck

# Format code
pnpm format
pnpm format:check
```

### Project Structure

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
├── tsconfig.json              # Root TypeScript configuration (strict, ESNext)
├── pnpm-workspace.yaml        # pnpm workspace definition
└── .github/workflows/         # CI/CD pipelines
```

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on commit conventions, testing requirements, and the pull request process. This project follows the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct.html) code of conduct.

For security vulnerabilities, please report directly via [GitHub Security Advisories](https://github.com/reaatech/llm-cache/security/advisories/new) rather than opening a public issue. See [SECURITY.md](SECURITY.md) for the full disclosure policy.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — System design, data flow, and component interfaces
- [DEV_PLAN.md](DEV_PLAN.md) — Development roadmap and milestones
- [AGENTS.md](AGENTS.md) — AI agent development framework and skill definitions

## License

MIT © [llm-cache contributors](https://github.com/reaatech/llm-cache/graphs/contributors)
