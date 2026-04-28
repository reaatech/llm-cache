import { describe, it, expect, beforeEach } from 'vitest';
import { CostCalculator } from './CostCalculator.js';

describe('CostCalculator', () => {
  let calculator: CostCalculator;

  beforeEach(() => {
    calculator = new CostCalculator([
      {
        modelId: 'gpt-4',
        inputPricing: { per1KTokens: 0.03, currency: 'USD' },
        outputPricing: { per1KTokens: 0.06, currency: 'USD' },
      },
      {
        modelId: 'gpt-3.5-turbo',
        inputPricing: { per1KTokens: 0.0015, currency: 'USD' },
        outputPricing: { per1KTokens: 0.002, currency: 'USD' },
      },
    ]);
  });

  it('should calculate cost for gpt-4', () => {
    const result = calculator.calculateCost('gpt-4', 1000, 500);
    expect(result.inputCost).toBeCloseTo(0.03, 4);
    expect(result.outputCost).toBeCloseTo(0.03, 4);
    expect(result.totalCost).toBeCloseTo(0.06, 4);
    expect(result.currency).toBe('USD');
  });

  it('should calculate cost for gpt-3.5-turbo', () => {
    const result = calculator.calculateCost('gpt-3.5-turbo', 2000, 1000);
    expect(result.inputCost).toBeCloseTo(0.003, 4);
    expect(result.outputCost).toBeCloseTo(0.002, 4);
    expect(result.totalCost).toBeCloseTo(0.005, 4);
  });

  it('should return zero cost for unknown model', () => {
    const result = calculator.calculateCost('unknown-model', 1000, 500);
    expect(result.totalCost).toBe(0);
    expect(result.inputCost).toBe(0);
    expect(result.outputCost).toBe(0);
  });

  it('should calculate savings correctly', () => {
    const savings = calculator.calculateSavings(0.06, 0.0001);
    expect(savings.originalCost).toBe(0.06);
    expect(savings.embeddingCost).toBe(0.0001);
    expect(savings.totalSavings).toBeCloseTo(0.0599, 4);
    expect(savings.savingsPercentage).toBeCloseTo(99.83, 1);
  });

  it('should not return negative savings', () => {
    const savings = calculator.calculateSavings(0.01, 0.02);
    expect(savings.totalSavings).toBe(0);
    expect(savings.savingsPercentage).toBe(0);
  });

  it('should allow registering new pricing', () => {
    calculator.registerPricing({
      modelId: 'custom-model',
      inputPricing: { per1KTokens: 0.1, currency: 'USD' },
      outputPricing: { per1KTokens: 0.2, currency: 'USD' },
    });

    const result = calculator.calculateCost('custom-model', 1000, 1000);
    expect(result.totalCost).toBeCloseTo(0.3, 4);
  });
});
