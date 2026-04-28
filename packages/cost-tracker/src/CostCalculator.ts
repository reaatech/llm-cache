export interface ModelPricing {
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

export interface CostBreakdown {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: string;
}

export class CostCalculator {
  private pricingDB = new Map<string, ModelPricing>();

  constructor(initialPricing?: ModelPricing[]) {
    if (initialPricing) {
      for (const p of initialPricing) {
        this.pricingDB.set(p.modelId, p);
      }
    }
  }

  registerPricing(pricing: ModelPricing): void {
    this.pricingDB.set(pricing.modelId, pricing);
  }

  calculateCost(
    model: string,
    promptTokens: number,
    completionTokens: number,
    currency = 'USD'
  ): CostBreakdown {
    const safePromptTokens = Math.max(0, promptTokens);
    const safeCompletionTokens = Math.max(0, completionTokens);

    const pricing = this.pricingDB.get(model);
    if (!pricing) {
      return {
        model,
        promptTokens: safePromptTokens,
        completionTokens: safeCompletionTokens,
        totalTokens: safePromptTokens + safeCompletionTokens,
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        currency,
      };
    }

    const inputCost = (safePromptTokens / 1000) * pricing.inputPricing.per1KTokens;
    const outputCost = (safeCompletionTokens / 1000) * pricing.outputPricing.per1KTokens;

    return {
      model,
      promptTokens: safePromptTokens,
      completionTokens: safeCompletionTokens,
      totalTokens: safePromptTokens + safeCompletionTokens,
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      currency: pricing.inputPricing.currency,
    };
  }

  calculateSavings(
    originalCost: number,
    embeddingCost: number
  ): {
    originalCost: number;
    embeddingCost: number;
    totalSavings: number;
    savingsPercentage: number;
  } {
    const totalSavings = Math.max(0, originalCost - embeddingCost);
    const savingsPercentage = originalCost > 0 ? (totalSavings / originalCost) * 100 : 0;

    return {
      originalCost,
      embeddingCost,
      totalSavings,
      savingsPercentage,
    };
  }
}
