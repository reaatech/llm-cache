# Cost Agent Skills

## Overview

The Cost Agent is responsible for implementing cost tracking and pricing calculations for the llm-cache project. This includes tracking LLM API costs, calculating savings from cache hits, and maintaining pricing data for 250+ models.

## Capabilities

### 1. Cost Calculation

- Calculate LLM API costs per request
- Track prompt and completion tokens separately
- Support multiple pricing tiers
- Handle currency conversion

### 2. Savings Tracking

- Calculate cost savings from cache hits
- Track savings by use case and model
- Generate cost savings reports
- Provide ROI analysis

### 3. Pricing Database

- Maintain pricing for 250+ models
- Support dynamic pricing updates
- Handle regional pricing variations
- Track pricing history

### 4. Cost Analytics

- Generate cost breakdown reports
- Track cost trends over time
- Identify cost optimization opportunities
- Provide cost forecasting

## Input/Output Specifications

### Input

- Model pricing data
- Token usage information
- Cache hit/miss data
- Cost reporting requirements

### Output

- Cost calculation implementations
- Savings tracking code
- Pricing database management
- Cost analytics and reports

## Usage Examples

### Example 1: Implementing Cost Calculator

**Request:**

```
Implement the CostCalculator with support for:
- Model-specific pricing
- Prompt and completion token costs
- Currency conversion
- Cost savings calculation from cache hits
```

**Response:**

```typescript
export class CostCalculator {
  private pricingDB: ModelPricingDatabase;
  private exchangeRates: ExchangeRateService;

  constructor(config: CostCalculatorConfig) {
    this.pricingDB = new ModelPricingDatabase(config.pricingData);
    this.exchangeRates = new ExchangeRateService(config.exchangeRateProvider);
  }

  calculateCost(
    model: string,
    promptTokens: number,
    completionTokens: number,
    currency: string = 'USD'
  ): CostBreakdown {
    const pricing = this.pricingDB.getPricing(model);

    if (!pricing) {
      throw new Error(`No pricing found for model: ${model}`);
    }

    // Calculate input cost
    const inputCost = this.calculateTieredCost(promptTokens, pricing.inputPricing);

    // Calculate output cost
    const outputCost = this.calculateTieredCost(completionTokens, pricing.outputPricing);

    const totalCost = inputCost + outputCost;

    // Convert currency if needed
    const convertedTotal =
      currency !== pricing.currency
        ? this.exchangeRates.convert(totalCost, pricing.currency, currency)
        : totalCost;

    return {
      model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      inputCost,
      outputCost,
      totalCost: convertedTotal,
      currency,
      pricingTier: this.determineTier(promptTokens + completionTokens, pricing),
    };
  }

  private calculateTieredCost(tokens: number, pricing: TokenPricing): number {
    if (!pricing.tiers) {
      // Simple flat pricing
      return (tokens / 1000) * pricing.per1KTokens;
    }

    // Tiered pricing calculation
    let cost = 0;
    let remainingTokens = tokens;
    let previousThreshold = 0;

    for (const tier of pricing.tiers) {
      const tierSize = tier.threshold - previousThreshold;
      const tokensInTier = Math.min(remainingTokens, tierSize);

      cost += (tokensInTier / 1000) * tier.pricePer1K;
      remainingTokens -= tokensInTier;
      previousThreshold = tier.threshold;

      if (remainingTokens <= 0) break;
    }

    // Handle any remaining tokens at the highest tier
    if (remainingTokens > 0) {
      const lastTier = pricing.tiers[pricing.tiers.length - 1];
      cost += (remainingTokens / 1000) * lastTier.pricePer1K;
    }

    return cost;
  }

  calculateSavings(cacheHit: CacheHit, originalCost: number): SavingsReport {
    const embeddingCost = this.calculateEmbeddingCost(cacheHit.entry.prompt.length);

    const totalSavings = originalCost - embeddingCost;
    const savingsPercentage = (totalSavings / originalCost) * 100;

    return {
      originalCost,
      embeddingCost,
      totalSavings,
      savingsPercentage,
      cacheType: cacheHit.type,
      confidence: cacheHit.confidence,
      cachedAt: cacheHit.cachedAt,
      age: cacheHit.age,
    };
  }

  private calculateEmbeddingCost(promptTokens: number): number {
    // Use actual token count when available (from API usage field)
    // Fallback to tiktoken for accurate estimation if unavailable
    const pricing = this.pricingDB.getPricing('text-embedding-3-small');

    if (!pricing) {
      return 0; // Fallback if pricing not available
    }

    return (promptTokens / 1000) * pricing.inputPricing.per1KTokens;
  }

  private estimateTokens(text: string, model: string = 'gpt-4'): number {
    // Use tiktoken or gpt-tokenizer for accurate token counting
    // This is significantly more accurate than textLength / 4
    try {
      const tokenizer = getTokenizerForModel(model);
      return tokenizer.encode(text).length;
    } catch {
      // Ultimate fallback: rough heuristic (4 chars per token)
      return Math.ceil(text.length / 4);
    }
  }
}
```

### Example 2: Implementing Cost Tracker

**Request:**

```
Implement the CostTracker with:
- Real-time cost tracking
- Savings accumulation
- Cost reporting by period
- Use case and model breakdown
```

**Response:**

```typescript
export class CostTracker {
  private costCalculator: CostCalculator;
  private metricsCollector: MetricsCollector;
  private storage: CostDataStorage;

  constructor(config: CostTrackerConfig) {
    this.costCalculator = new CostCalculator(config);
    this.metricsCollector = config.metricsCollector;
    this.storage = config.storage;
  }

  async trackLLMCall(
    model: string,
    promptTokens: number,
    completionTokens: number,
    useCase?: string
  ): Promise<CostBreakdown> {
    const cost = this.costCalculator.calculateCost(model, promptTokens, completionTokens);

    // Store cost data
    await this.storage.recordCost({
      timestamp: new Date(),
      model,
      useCase: useCase ?? 'general',
      promptTokens,
      completionTokens,
      ...cost,
    });

    // Record metrics
    this.metricsCollector.recordCost(cost.totalCost);
    this.metricsCollector.recordTokenUsage({
      model,
      promptTokens,
      completionTokens,
    });

    return cost;
  }

  async trackCacheHit(
    cacheHit: CacheHit,
    originalModel: string,
    originalPromptTokens: number,
    originalCompletionTokens: number
  ): Promise<SavingsReport> {
    // Calculate what the original cost would have been
    const originalCost = this.costCalculator.calculateCost(
      originalModel,
      originalPromptTokens,
      originalCompletionTokens
    );

    // Calculate savings
    const savings = this.costCalculator.calculateSavings(cacheHit, originalCost.totalCost);

    // Store savings data
    await this.storage.recordSavings({
      timestamp: new Date(),
      cacheType: cacheHit.type,
      model: cacheHit.entry.model,
      useCase: cacheHit.entry.useCase,
      ...savings,
    });

    // Record metrics
    this.metricsCollector.recordCacheHit(cacheHit.type);
    this.metricsCollector.recordSavings(savings.totalSavings);

    return savings;
  }

  async getCostReport(period: string, groupBy?: 'useCase' | 'model' | 'day'): Promise<CostReport> {
    const costData = await this.storage.getCostData(period);
    const savingsData = await this.storage.getSavingsData(period);

    // Group and aggregate data
    const grouped = this.groupByField(costData, groupBy);
    const savingsByGroup = this.groupByField(savingsData, groupBy);

    const report: CostReport = {
      period,
      totalCost: costData.reduce((sum, d) => sum + d.totalCost, 0),
      totalSavings: savingsData.reduce((sum, d) => sum + d.totalSavings, 0),
      cacheHitRate: this.calculateHitRate(costData, savingsData),
      breakdown: {},
    };

    // Build breakdown by group
    for (const [key, costs] of Object.entries(grouped)) {
      const savings = savingsByGroup[key] ?? [];
      report.breakdown[key] = {
        cost: costs.reduce((sum, d) => sum + d.totalCost, 0),
        savings: savings.reduce((sum, d) => sum + d.totalSavings, 0),
        count: costs.length,
        avgCost: costs.reduce((sum, d) => sum + d.totalCost, 0) / costs.length,
      };
    }

    return report;
  }

  private groupByField<T extends { useCase?: string; model?: string; timestamp?: Date }>(
    data: T[],
    field?: string
  ): Record<string, T[]> {
    if (!field) {
      return { all: data };
    }

    return data.reduce(
      (acc, item) => {
        let key: string;

        switch (field) {
          case 'useCase':
            key = item.useCase ?? 'unknown';
            break;
          case 'model':
            key = item.model ?? 'unknown';
            break;
          case 'day':
            key = item.timestamp?.toDateString() ?? 'unknown';
            break;
          default:
            key = 'all';
        }

        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(item);

        return acc;
      },
      {} as Record<string, T[]>
    );
  }

  private calculateHitRate(costData: any[], savingsData: any[]): number {
    const totalRequests = costData.length + savingsData.length;
    if (totalRequests === 0) return 0;

    return (savingsData.length / totalRequests) * 100;
  }
}
```

## Best Practices

### 1. Cost Accuracy

- Use official pricing data from providers
- Update pricing data regularly
- Handle pricing changes gracefully
- Track pricing history for audits

### 2. Performance

- Cache pricing data in memory
- Batch cost calculations when possible
- Optimize database queries
- Use efficient aggregation algorithms

### 3. Data Integrity

- Validate all cost calculations
- Implement audit trails
- Handle currency conversion accurately
- Track calculation methodology

### 4. Reporting

- Provide clear cost breakdowns
- Include savings attribution
- Support multiple time periods
- Enable drill-down analysis

## Constraints

### Technical Constraints

- Must support 250+ models
- Must handle multiple currencies
- Must track both costs and savings
- Must provide real-time tracking

### Performance Constraints

- Cost calculation: < 1ms
- Report generation: < 100ms for 1M records
- Must handle 1000+ cost tracking operations/second
- Pricing data updates: < 1 second propagation

## Integration Points

### With Architect Agent

- Follow cost tracking architecture
- Implement cost data models
- Provide cost optimization recommendations

### With Core Agent

- Track costs for all cache operations
- Calculate savings from cache hits
- Provide cost metadata for cache entries

### With Observability Agent

- Export cost metrics
- Add cost logging
- Implement cost alerting

### With Testing Agent

- Validate cost calculations
- Test pricing data accuracy
- Verify savings calculations

## Quality Metrics

- **Calculation Accuracy**: 100% accurate cost calculations
- **Pricing Coverage**: 250+ models supported
- **Report Generation**: < 100ms for standard reports
- **Data Freshness**: Real-time cost tracking

## Tools and Resources

- **Pricing Data**: OpenAI API, Anthropic API, AWS Pricing API
- **Currency Conversion**: Exchange rate APIs
- **Storage**: Redis, DynamoDB for cost data
- **Analytics**: Custom aggregation, reporting tools

---

**Skill Version**: 1.0.0  
**Last Updated**: 2026-04-22  
**Maintained by**: reiatech
