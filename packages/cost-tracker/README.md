# @reaatech/llm-cache-cost-tracker

[![npm version](https://img.shields.io/npm/v/@reaatech/llm-cache-cost-tracker.svg)](https://www.npmjs.com/package/@reaatech/llm-cache-cost-tracker)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/llm-cache/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/llm-cache/ci.yml?branch=main&label=CI)](https://github.com/reaatech/llm-cache/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Cost calculator and model pricing database for llm-cache. Computes per-request costs, tracks savings from cache hits, and ships with reference pricing for 40+ models across OpenAI, Anthropic, and Google.

## Installation

```bash
npm install @reaatech/llm-cache-cost-tracker
# or
pnpm add @reaatech/llm-cache-cost-tracker
```

## Feature Overview

- **Per-request cost calculation** — input and output cost from token counts and model pricing
- **40+ pre-configured models** — OpenAI, Anthropic, and Google pricing data included
- **Savings computation** — `calculateSavings()` returns percentage and absolute savings from cache hits
- **Extensible pricing** — register custom or updated pricing via `registerPricing()`
- **Implements `CostCalculatorLike`** — drop-in integration with `@reaatech/llm-cache`'s `CostCalculatorLike` interface

## Quick Start

```typescript
import { CostCalculator, defaultPricingDatabase } from "@reaatech/llm-cache-cost-tracker";

const calculator = new CostCalculator(defaultPricingDatabase);

const cost = calculator.calculateCost("gpt-4", 1000, 500);
// → { model: "gpt-4", inputCost: 0.03, outputCost: 0.03, totalCost: 0.06, currency: "USD" }

const savings = calculator.calculateSavings(0.06, 0.0001);
// → { originalCost: 0.06, cacheCost: 0.0001, totalSavings: 0.0599, savingsPercentage: 99.83 }
```

### Integration with CacheEngine

```typescript
import { CacheEngine, InMemoryAdapter, OpenAIEmbedder } from "@reaatech/llm-cache";
import { CostCalculator, defaultPricingDatabase } from "@reaatech/llm-cache-cost-tracker";

const cache = new CacheEngine({
  storage: new InMemoryAdapter(),
  vectorStorage: new InMemoryAdapter(),
  embedder: /* ... */,
  config: { /* ... */ },
  costCalculator: new CostCalculator(defaultPricingDatabase),
});

// cost tracking happens automatically on cache hits
const result = await cache.get("What is TypeScript?", {
  model: "gpt-4",
  modelVersion: "gpt-4-0613",
});
```

## API Reference

### `CostCalculator` (class)

```typescript
import { CostCalculator } from "@reaatech/llm-cache-cost-tracker";

const calc = new CostCalculator();                 // empty pricing DB
const calc = new CostCalculator(customPricing);    // with initial pricing
```

#### Constructor

| Parameter | Type | Description |
|-----------|------|-------------|
| `initialPricing` | `ModelPricing[]` | Optional array of model pricing records to pre-register |

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `registerPricing(pricing)` | `void` | Register or overwrite pricing for a model |
| `calculateCost(model, promptTokens, completionTokens, currency?)` | `CostBreakdown` | Compute cost from token usage |
| `calculateSavings(originalCost, cacheCost)` | `SavingsReport` | Compute savings from a cache hit |

### `ModelPricing`

```typescript
interface ModelPricing {
  modelId: string;
  inputPricing: {
    per1KTokens: number;
    currency: string;
  };
  outputPricing: {
    per1KTokens: number;
    currency: string;
  };
}
```

### `CostBreakdown`

Returned by `calculateCost()`:

| Property | Type | Description |
|----------|------|-------------|
| `model` | `string` | Model identifier |
| `promptTokens` | `number` | Input token count |
| `completionTokens` | `number` | Output token count |
| `totalTokens` | `number` | Sum of input and output tokens |
| `inputCost` | `number` | Cost of prompt tokens |
| `outputCost` | `number` | Cost of completion tokens |
| `totalCost` | `number` | Sum of input and output costs |
| `currency` | `string` | Currency code (default `"USD"`) |

### `SavingsReport`

Returned by `calculateSavings()`:

| Property | Type | Description |
|----------|------|-------------|
| `originalCost` | `number` | Original API cost |
| `cacheCost` | `number` | Embedding/retrieval cost |
| `totalSavings` | `number` | `originalCost - cacheCost` |
| `savingsPercentage` | `number` | Percentage saved (0–100) |

### `defaultPricingDatabase`

A pre-configured `ModelPricing[]` array covering 40+ models from OpenAI, Anthropic, and Google. Import and pass to `CostCalculator`:

```typescript
import { CostCalculator, defaultPricingDatabase } from "@reaatech/llm-cache-cost-tracker";

const calc = new CostCalculator(defaultPricingDatabase);
```

## Usage Patterns

### Custom Model Pricing

```typescript
const calc = new CostCalculator();

calc.registerPricing({
  modelId: "my-custom-model",
  inputPricing: { per1KTokens: 0.01, currency: "USD" },
  outputPricing: { per1KTokens: 0.02, currency: "USD" },
});

const cost = calc.calculateCost("my-custom-model", 500, 300);
```

### Non-USD Currency

```typescript
const cost = calc.calculateCost("gpt-4", 1000, 500, "EUR");
// Returns costs in configured currency from the pricing record
```

### Safety With Missing Models

When a model is not found in the pricing database, `calculateCost()` returns zero costs rather than throwing:

```typescript
const cost = calc.calculateCost("unknown-model", 1000, 500);
// → { inputCost: 0, outputCost: 0, totalCost: 0, ... }
```

## Notes

- Pricing data is provided as reference and may lag provider price changes. Verify against your provider before relying on it for billing.
- Token counts should be sourced from your LLM provider's response `usage` field, not estimated locally.

## Related Packages

- [`@reaatech/llm-cache`](https://www.npmjs.com/package/@reaatech/llm-cache) — Core caching engine (accepts `CostCalculatorLike` instances)
- [`@reaatech/llm-cache-observability`](https://www.npmjs.com/package/@reaatech/llm-cache-observability) — Prometheus metrics including `cache_cost_savings_total`

## License

[MIT](https://github.com/reaatech/llm-cache/blob/main/LICENSE)
