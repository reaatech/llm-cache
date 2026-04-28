export interface EmbeddingProvider {
  embed(text: string, expectedDimensions?: number): Promise<number[]>;
  embedBatch(texts: string[], expectedDimensions?: number): Promise<number[][]>;
}

export interface EmbeddingProviderConfig {
  provider: 'openai';
  model: string;
  dimensions: number;
  apiKey: string;
  organization?: string;
  maxRetries?: number;
  timeoutMs?: number;
}
