import { createHash } from 'node:crypto';
import type { EmbeddingProvider, EmbeddingProviderConfig } from './EmbeddingProvider.js';

const DEFAULT_CACHE_SIZE = 1000;
const DEFAULT_BATCH_SIZE = 100;

export interface OpenAIEmbedderOptions extends EmbeddingProviderConfig {
  cacheSize?: number;
  batchSize?: number;
}

export class OpenAIEmbedder implements EmbeddingProvider {
  private apiKey: string;
  private organization?: string;
  private model: string;
  private dimensions: number;
  private maxRetries: number;
  private timeoutMs: number;
  private cacheSize: number;
  private batchSize: number;
  private cache = new Map<string, number[]>();

  constructor(config: OpenAIEmbedderOptions) {
    this.apiKey = config.apiKey;
    this.organization = config.organization;
    this.model = config.model;
    this.dimensions = config.dimensions;
    this.maxRetries = config.maxRetries ?? 3;
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.cacheSize = config.cacheSize ?? DEFAULT_CACHE_SIZE;
    this.batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
  }

  async embed(text: string, expectedDimensions?: number): Promise<number[]> {
    const cacheKey = this.hashText(text);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      if (expectedDimensions && cached.length !== expectedDimensions) {
        throw new Error(
          `Embedding dimension mismatch: cached=${cached.length}, expected=${expectedDimensions}`,
        );
      }
      // Refresh LRU position
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cached);
      return cached;
    }

    const [embedding] = await this.fetchEmbeddings([text], expectedDimensions);
    this.cacheSet(cacheKey, embedding);
    return embedding;
  }

  async embedBatch(texts: string[], expectedDimensions?: number): Promise<number[][]> {
    if (texts.length === 0) return [];

    const out: number[][] = new Array<number[]>(texts.length);
    const toFetchIndices: number[] = [];
    const toFetchTexts: string[] = [];

    for (let i = 0; i < texts.length; i++) {
      const cacheKey = this.hashText(texts[i]);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        if (expectedDimensions && cached.length !== expectedDimensions) {
          throw new Error(
            `Embedding dimension mismatch: cached=${cached.length}, expected=${expectedDimensions}`,
          );
        }
        this.cache.delete(cacheKey);
        this.cache.set(cacheKey, cached);
        out[i] = cached;
      } else {
        toFetchIndices.push(i);
        toFetchTexts.push(texts[i]);
      }
    }

    for (let offset = 0; offset < toFetchTexts.length; offset += this.batchSize) {
      const chunk = toFetchTexts.slice(offset, offset + this.batchSize);
      const chunkEmbeddings = await this.fetchEmbeddings(chunk, expectedDimensions);

      for (let j = 0; j < chunk.length; j++) {
        const originalIndex = toFetchIndices[offset + j];
        const embedding = chunkEmbeddings[j];
        out[originalIndex] = embedding;
        this.cacheSet(this.hashText(chunk[j]), embedding);
      }
    }

    return out;
  }

  private async fetchEmbeddings(texts: string[], expectedDimensions?: number): Promise<number[][]> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      let response: Response;
      try {
        response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            ...(this.organization ? { 'OpenAI-Organization': this.organization } : {}),
          },
          body: JSON.stringify({
            model: this.model,
            input: texts.length === 1 ? texts[0] : texts,
            dimensions: this.dimensions,
          }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.maxRetries) {
          await this.sleep(this.backoffMs(attempt));
          continue;
        }
        throw lastError;
      }

      if (!response.ok) {
        const body = await response.text();
        const error = new Error(`OpenAI API error ${response.status}: ${body}`);
        const retriable = response.status === 429 || response.status >= 500;
        if (retriable && attempt < this.maxRetries) {
          lastError = error;
          await this.sleep(this.backoffMs(attempt));
          continue;
        }
        throw error;
      }

      try {
        const data = (await response.json()) as {
          data: Array<{ embedding: number[]; index?: number }>;
        };

        const sorted = [...data.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        const embeddings = sorted.map((d) => d.embedding);

        if (expectedDimensions) {
          for (const e of embeddings) {
            if (e.length !== expectedDimensions) {
              throw new Error(
                `Embedding dimension mismatch: received=${e.length}, expected=${expectedDimensions}`,
              );
            }
          }
        }

        return embeddings;
      } catch (parseError) {
        const err = parseError instanceof Error ? parseError : new Error(String(parseError));
        if (err.message.includes('dimension mismatch')) {
          throw err;
        }
        lastError = err;
        if (attempt < this.maxRetries) {
          await this.sleep(this.backoffMs(attempt));
          continue;
        }
        throw lastError;
      }
    }

    throw lastError ?? new Error('Failed to fetch embedding');
  }

  private cacheSet(key: string, value: number[]): void {
    if (this.cache.size >= this.cacheSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, value);
  }

  private hashText(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }

  private backoffMs(attempt: number): number {
    return 2 ** attempt * 1000;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
