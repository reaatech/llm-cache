import type { VectorStorageAdapter } from '../storage/StorageAdapter.js';
import type { CacheEntry, SimilarityResult, VectorSearchFilters } from '../types/index.js';

export class SimilarityMatcher {
  constructor(private vectorStorage: VectorStorageAdapter) {}

  async findSimilar(
    embedding: number[],
    filters: VectorSearchFilters,
    threshold: number,
    limit = 10,
  ): Promise<SimilarityResult[]> {
    const results = await this.vectorStorage.findSimilar(embedding, threshold, filters, limit);

    return results
      .filter((r) => !this.isExpired(r.entry))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  calculateCosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    }

    let dotProduct = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }

    if (magA === 0 || magB === 0) return 0;
    return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  private isExpired(entry: CacheEntry): boolean {
    return entry.metadata.expiresAt.getTime() < Date.now();
  }
}
