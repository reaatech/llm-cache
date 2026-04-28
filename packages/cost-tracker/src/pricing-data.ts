import type { ModelPricing } from './CostCalculator.js';

/**
 * Reference pricing database for popular OpenAI, Anthropic, Google, Cohere, Mistral,
 * Meta, and embedding models. All prices are per 1K tokens in USD.
 *
 * Snapshot last reviewed against provider price pages in early 2026. Provider pricing
 * changes frequently — verify against your provider's billing page before relying on
 * these figures for cost reporting. Use `CostCalculator.registerPricing()` to override
 * or extend at runtime.
 *
 * Note on pricing units: provider price pages typically quote prices per 1M tokens.
 * Divide by 1000 to get per-1K values used here (e.g. $2.50/1M → 0.0025 per 1K).
 */
export const defaultPricingDatabase: ModelPricing[] = [
  // OpenAI — GPT-4 family
  {
    modelId: 'gpt-4',
    inputPricing: { per1KTokens: 0.03, currency: 'USD' },
    outputPricing: { per1KTokens: 0.06, currency: 'USD' },
  },
  {
    modelId: 'gpt-4-0613',
    inputPricing: { per1KTokens: 0.03, currency: 'USD' },
    outputPricing: { per1KTokens: 0.06, currency: 'USD' },
  },
  {
    modelId: 'gpt-4-turbo',
    inputPricing: { per1KTokens: 0.01, currency: 'USD' },
    outputPricing: { per1KTokens: 0.03, currency: 'USD' },
  },
  {
    modelId: 'gpt-4-turbo-2024-04-09',
    inputPricing: { per1KTokens: 0.01, currency: 'USD' },
    outputPricing: { per1KTokens: 0.03, currency: 'USD' },
  },

  // OpenAI — GPT-4o family
  {
    modelId: 'gpt-4o',
    inputPricing: { per1KTokens: 0.0025, currency: 'USD' },
    outputPricing: { per1KTokens: 0.01, currency: 'USD' },
  },
  {
    modelId: 'gpt-4o-2024-08-06',
    inputPricing: { per1KTokens: 0.0025, currency: 'USD' },
    outputPricing: { per1KTokens: 0.01, currency: 'USD' },
  },
  {
    modelId: 'gpt-4o-2024-05-13',
    inputPricing: { per1KTokens: 0.005, currency: 'USD' },
    outputPricing: { per1KTokens: 0.015, currency: 'USD' },
  },
  {
    modelId: 'gpt-4o-mini',
    inputPricing: { per1KTokens: 0.00015, currency: 'USD' },
    outputPricing: { per1KTokens: 0.0006, currency: 'USD' },
  },
  {
    modelId: 'gpt-4o-mini-2024-07-18',
    inputPricing: { per1KTokens: 0.00015, currency: 'USD' },
    outputPricing: { per1KTokens: 0.0006, currency: 'USD' },
  },

  // OpenAI — o-series reasoning models
  {
    modelId: 'o1',
    inputPricing: { per1KTokens: 0.015, currency: 'USD' },
    outputPricing: { per1KTokens: 0.06, currency: 'USD' },
  },
  {
    modelId: 'o1-preview',
    inputPricing: { per1KTokens: 0.015, currency: 'USD' },
    outputPricing: { per1KTokens: 0.06, currency: 'USD' },
  },
  {
    modelId: 'o1-mini',
    inputPricing: { per1KTokens: 0.003, currency: 'USD' },
    outputPricing: { per1KTokens: 0.012, currency: 'USD' },
  },
  {
    modelId: 'o3-mini',
    inputPricing: { per1KTokens: 0.0011, currency: 'USD' },
    outputPricing: { per1KTokens: 0.0044, currency: 'USD' },
  },

  // OpenAI — GPT-3.5
  {
    modelId: 'gpt-3.5-turbo',
    inputPricing: { per1KTokens: 0.0005, currency: 'USD' },
    outputPricing: { per1KTokens: 0.0015, currency: 'USD' },
  },
  {
    modelId: 'gpt-3.5-turbo-0125',
    inputPricing: { per1KTokens: 0.0005, currency: 'USD' },
    outputPricing: { per1KTokens: 0.0015, currency: 'USD' },
  },
  {
    modelId: 'gpt-3.5-turbo-instruct',
    inputPricing: { per1KTokens: 0.0015, currency: 'USD' },
    outputPricing: { per1KTokens: 0.002, currency: 'USD' },
  },

  // Anthropic — Claude 3 family
  {
    modelId: 'claude-3-opus-20240229',
    inputPricing: { per1KTokens: 0.015, currency: 'USD' },
    outputPricing: { per1KTokens: 0.075, currency: 'USD' },
  },
  {
    modelId: 'claude-3-sonnet-20240229',
    inputPricing: { per1KTokens: 0.003, currency: 'USD' },
    outputPricing: { per1KTokens: 0.015, currency: 'USD' },
  },
  {
    modelId: 'claude-3-haiku-20240307',
    inputPricing: { per1KTokens: 0.00025, currency: 'USD' },
    outputPricing: { per1KTokens: 0.00125, currency: 'USD' },
  },

  // Anthropic — Claude 3.5 / 3.7 families
  {
    modelId: 'claude-3-5-sonnet-20240620',
    inputPricing: { per1KTokens: 0.003, currency: 'USD' },
    outputPricing: { per1KTokens: 0.015, currency: 'USD' },
  },
  {
    modelId: 'claude-3-5-sonnet-20241022',
    inputPricing: { per1KTokens: 0.003, currency: 'USD' },
    outputPricing: { per1KTokens: 0.015, currency: 'USD' },
  },
  {
    modelId: 'claude-3-5-haiku-20241022',
    inputPricing: { per1KTokens: 0.0008, currency: 'USD' },
    outputPricing: { per1KTokens: 0.004, currency: 'USD' },
  },
  {
    modelId: 'claude-3-7-sonnet-20250219',
    inputPricing: { per1KTokens: 0.003, currency: 'USD' },
    outputPricing: { per1KTokens: 0.015, currency: 'USD' },
  },

  // Anthropic — legacy Claude
  {
    modelId: 'claude-2.1',
    inputPricing: { per1KTokens: 0.008, currency: 'USD' },
    outputPricing: { per1KTokens: 0.024, currency: 'USD' },
  },
  {
    modelId: 'claude-2.0',
    inputPricing: { per1KTokens: 0.008, currency: 'USD' },
    outputPricing: { per1KTokens: 0.024, currency: 'USD' },
  },

  // Google — Gemini
  {
    modelId: 'gemini-2.0-flash',
    inputPricing: { per1KTokens: 0.0001, currency: 'USD' },
    outputPricing: { per1KTokens: 0.0004, currency: 'USD' },
  },
  {
    modelId: 'gemini-1.5-pro',
    inputPricing: { per1KTokens: 0.00125, currency: 'USD' },
    outputPricing: { per1KTokens: 0.005, currency: 'USD' },
  },
  {
    modelId: 'gemini-1.5-flash',
    inputPricing: { per1KTokens: 0.000075, currency: 'USD' },
    outputPricing: { per1KTokens: 0.0003, currency: 'USD' },
  },
  {
    modelId: 'gemini-1.0-pro',
    inputPricing: { per1KTokens: 0.0005, currency: 'USD' },
    outputPricing: { per1KTokens: 0.0015, currency: 'USD' },
  },

  // Cohere
  {
    modelId: 'command-r',
    inputPricing: { per1KTokens: 0.00015, currency: 'USD' },
    outputPricing: { per1KTokens: 0.0006, currency: 'USD' },
  },
  {
    modelId: 'command-r-plus',
    inputPricing: { per1KTokens: 0.0025, currency: 'USD' },
    outputPricing: { per1KTokens: 0.01, currency: 'USD' },
  },

  // Mistral
  {
    modelId: 'mistral-large-latest',
    inputPricing: { per1KTokens: 0.002, currency: 'USD' },
    outputPricing: { per1KTokens: 0.006, currency: 'USD' },
  },
  {
    modelId: 'mistral-medium-latest',
    inputPricing: { per1KTokens: 0.0027, currency: 'USD' },
    outputPricing: { per1KTokens: 0.0081, currency: 'USD' },
  },
  {
    modelId: 'mistral-small-latest',
    inputPricing: { per1KTokens: 0.0002, currency: 'USD' },
    outputPricing: { per1KTokens: 0.0006, currency: 'USD' },
  },

  // Meta Llama (representative reseller pricing — varies widely by host)
  {
    modelId: 'llama-3.1-405b',
    inputPricing: { per1KTokens: 0.0027, currency: 'USD' },
    outputPricing: { per1KTokens: 0.0027, currency: 'USD' },
  },
  {
    modelId: 'llama-3-70b',
    inputPricing: { per1KTokens: 0.0009, currency: 'USD' },
    outputPricing: { per1KTokens: 0.0009, currency: 'USD' },
  },
  {
    modelId: 'llama-3-8b',
    inputPricing: { per1KTokens: 0.0002, currency: 'USD' },
    outputPricing: { per1KTokens: 0.0002, currency: 'USD' },
  },

  // Embedding models
  {
    modelId: 'text-embedding-3-small',
    inputPricing: { per1KTokens: 0.00002, currency: 'USD' },
    outputPricing: { per1KTokens: 0, currency: 'USD' },
  },
  {
    modelId: 'text-embedding-3-large',
    inputPricing: { per1KTokens: 0.00013, currency: 'USD' },
    outputPricing: { per1KTokens: 0, currency: 'USD' },
  },
  {
    modelId: 'text-embedding-ada-002',
    inputPricing: { per1KTokens: 0.0001, currency: 'USD' },
    outputPricing: { per1KTokens: 0, currency: 'USD' },
  },
];
