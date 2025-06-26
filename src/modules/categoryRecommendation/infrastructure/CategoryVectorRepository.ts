import { OpenAIEmbeddingService } from '../../../infrastructure/openai/OpenAIEmbeddingService';

export interface CategoryVector {
  label: string;
  embedding: number[];
}

export class CategoryVectorRepository {
  constructor(
    private supabase: any,
    private embeddingService: OpenAIEmbeddingService
  ) {}

  private cosineSimilarity(a: number[], b: number[]): number {
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    if (magA === 0 || magB === 0) return 0;
    return dot / (magA * magB);
  }

  async findNearest(text: string): Promise<{ label: string; score: number }> {
    const { data, error } = await this.supabase
      .from('category_vectors')
      .select('label, embedding');

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      throw new Error('No data returned from category_vectors');
    }

    const queryEmbeddingArr = await this.embeddingService.embed(text);
    const queryEmbedding = Array.from(queryEmbeddingArr);

    let bestLabel = '';
    let bestScore = -1;

    for (const row of data as CategoryVector[]) {
      const score = this.cosineSimilarity(queryEmbedding, row.embedding);
      if (score > bestScore) {
        bestScore = score;
        bestLabel = row.label;
      }
    }

    return { label: bestLabel, score: bestScore };
  }
}
