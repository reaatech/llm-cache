# @llm-cache/cost-tracker

Cost tracking and pricing calculations for llm-cache.

## Install

```bash
npm install @llm-cache/cost-tracker
```

## Usage

```typescript
import { CostCalculator } from '@llm-cache/cost-tracker';

const calculator = new CostCalculator([
  {
    modelId: 'gpt-4',
    inputPricing: { per1KTokens: 0.03, currency: 'USD' },
    outputPricing: { per1KTokens: 0.06, currency: 'USD' },
  },
]);

const cost = calculator.calculateCost('gpt-4', 1000, 500);
// { totalCost: 0.06, currency: 'USD', ... }

const savings = calculator.calculateSavings(0.06, 0.0001);
// { totalSavings: 0.0599, savingsPercentage: 99.83 }
```

## License

MIT
