# @reaatech/llm-cache-observability

[![npm version](https://img.shields.io/npm/v/@reaatech/llm-cache-observability.svg)](https://www.npmjs.com/package/@reaatech/llm-cache-observability)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/llm-cache/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/llm-cache/ci.yml?branch=main&label=CI)](https://github.com/reaatech/llm-cache/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Observability utilities for llm-cache — structured JSON logging with automatic PII redaction, Prometheus-compatible metrics collection, and optional distributed tracing hooks.

## Installation

```bash
npm install @reaatech/llm-cache-observability
# or
pnpm add @reaatech/llm-cache-observability
```

## Feature Overview

- **Structured JSON logging** — writes NDJSON to `stdout` with automatic timestamps and correlation IDs
- **Automatic PII redaction** — 17 sensitive field names are redacted from all log output (`prompt`, `apiKey`, `token`, `secret`, etc.)
- **Correlation ID propagation** — `child()` creates scoped loggers carrying the request-level correlation ID
- **Prometheus metrics** — counters and histograms with `toPrometheus()` text exposition format
- **Label cardinality protection** — configurable cap on distinct counter labels (excess bucketed as `"other"`)
- **Histogram retention cap** — configurable max samples per histogram (old samples dropped)
- **Zero runtime dependencies** — no third-party logging or metrics libraries

## Quick Start

```typescript
import { Logger, MetricsCollector } from "@reaatech/llm-cache-observability";

// Structured logging
const logger = new Logger({ level: "info" });
logger.info("Cache hit", { type: "exact", latencyMs: 12 });
logger.cacheHit("exact", 12, 0.95);
logger.cacheMiss(45);
logger.error("Request failed", new Error("timeout"), { path: "/cache/get" });

// Metrics collection
const metrics = new MetricsCollector({ enabled: true });
metrics.recordHit("exact");
metrics.recordMiss();
metrics.recordLatency("get", 42);
metrics.recordSavings(0.0599);

// Prometheus exposition
console.log(metrics.toPrometheus());
// → # HELP cache_hits_total_exact Total exact cache hits
// → # TYPE cache_hits_total_exact counter
// → cache_hits_total_exact 1
// → ...
```

## API Reference

### `Logger` (class)

```typescript
import { Logger } from "@reaatech/llm-cache-observability";

const logger = new Logger({ level: "info", correlationId: "req-abc123" });
```

#### `LoggerConfig`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `level` | `"error" \| "warn" \| "info" \| "debug"` | `"info"` | Minimum log level |
| `correlationId` | `string` | auto-generated UUID | Correlation ID for request tracing |
| `context` | `Record<string, unknown>` | — | Key-value pairs to include in every log line |

#### Methods

| Method | Description |
|--------|-------------|
| `error(message, error?, meta?)` | Log at ERROR level. Error stack is automatically serialized |
| `warn(message, meta?)` | Log at WARN level |
| `info(message, meta?)` | Log at INFO level |
| `debug(message, meta?)` | Log at DEBUG level |
| `child(context)` | Create a child logger inheriting the correlation ID and merging context |
| `cacheHit(type, latencyMs, confidence?)` | Structured convenience method for cache hit events |
| `cacheMiss(latencyMs)` | Structured convenience method for cache miss events |

All methods automatically redact values for 17 sensitive field names: `password`, `apiKey`, `api_key`, `secret`, `token`, `authorization`, `prompt`, `response`, `credential`, `private_key`, `privateKey`, `accessKeyId`, `secretAccessKey`, and fields containing any of these substrings.

#### Log Output Format

```
{"level":"INFO","timestamp":"2026-04-30T12:00:00.000Z","correlationId":"req-abc123","message":"Cache hit","type":"exact","latencyMs":12}
{"level":"ERROR","timestamp":"...","correlationId":"...","message":"Request failed","error":"timeout","stack":"...","path":"/cache/get"}
```

### `MetricsCollector` (class)

```typescript
import { MetricsCollector } from "@reaatech/llm-cache-observability";

const metrics = new MetricsCollector({ enabled: true, serviceName: "llm-cache" });
```

#### `MetricsCollectorConfig`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Disable to turn metrics into no-ops |
| `serviceName` | `string` | — | Service name (reserved for future use) |
| `maxLabelCardinality` | `number` | `128` | Max distinct label values per metric family |
| `maxHistogramSamples` | `number` | `1024` | Max samples retained per histogram |

#### Recording Methods

| Method | Description |
|--------|-------------|
| `recordHit(type)` | Increment `cache_hits_total_<type>` and `cache_requests_total` |
| `recordMiss()` | Increment `cache_misses_total` and `cache_requests_total` |
| `recordLatency(operation, durationMs)` | Append to histogram `cache_latency_ms_<operation>` |
| `recordSavings(amount)` | Increment `cache_cost_savings_total` by amount |
| `recordSemanticHitQuality(accepted, useCase)` | Increment quality counter segmented by use case |
| `recordError(operation, errorType)` | Increment error counter segmented by operation and error type |

#### Query Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `getCounters()` | `Record<string, number>` | All counter values as a plain object |
| `getHistograms()` | `Record<string, number[]>` | All histogram sample arrays |
| `toPrometheus()` | `string` | Prometheus text exposition format for scraping |

#### Prometheus Output

```
# HELP cache_hits_total_exact Total exact cache hits
# TYPE cache_hits_total_exact counter
cache_hits_total_exact 42

# HELP cache_latency_ms_get Cache operation latency in ms for get
# TYPE cache_latency_ms_get histogram
cache_latency_ms_get{quantile="0.5"} 12
cache_latency_ms_get{quantile="0.95"} 45
cache_latency_ms_get{quantile="0.99"} 98
```

## Usage Patterns

### Correlation ID Propagation

```typescript
import { randomUUID } from "node:crypto";

async function handleRequest(req: Request) {
  const correlationId = req.headers["x-correlation-id"] ?? randomUUID();
  const logger = new Logger({ correlationId }).child({ path: req.url });

  logger.info("Request received");

  // Nested calls carry the same correlation ID
  await processTask(logger.child({ component: "task-executor" }));
}
```

### Metrics-Only Mode

```typescript
// Disable metrics in tests or when scraping is handled externally
const metrics = new MetricsCollector({ enabled: false });
metrics.recordHit("exact"); // no-op
```

### Label Cardinality Safety

```typescript
const metrics = new MetricsCollector({ maxLabelCardinality: 64 });

// Up to 64 distinct operation names tracked per metric family
metrics.recordLatency("get", 12);
metrics.recordLatency("set", 8);
metrics.recordLatency("very-specific-op-name-65", 5); // bucketed as "other"
```

## Integration with the Server

The `@reaatech/llm-cache-server` package uses both `Logger` and `MetricsCollector` for request logging, cache event tracking, and Prometheus scraping at `GET /metrics`:

```typescript
import { Logger, MetricsCollector } from "@reaatech/llm-cache-observability";

const logger = new Logger({ level: "info" });
const metrics = new MetricsCollector({ enabled: true });

// On cache hit:
metrics.recordHit("exact");
logger.cacheHit("exact", latencyMs, confidence);
```

## Related Packages

- [`@reaatech/llm-cache`](https://www.npmjs.com/package/@reaatech/llm-cache) — Core caching engine
- [`@reaatech/llm-cache-server`](https://www.npmjs.com/package/@reaatech/llm-cache-server) — HTTP server wrapper (uses both `Logger` and `MetricsCollector`)
- [`@reaatech/llm-cache-cost-tracker`](https://www.npmjs.com/package/@reaatech/llm-cache-cost-tracker) — Cost tracking (pairs with `recordSavings`)

## License

[MIT](https://github.com/reaatech/llm-cache/blob/main/LICENSE)
