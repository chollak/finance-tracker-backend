import { OpenAIEmbeddingService } from '../../../infrastructure/openai/OpenAIEmbeddingService';

interface CategoryVectorRow {
    id: number;
    label: string;
    embedding: number[];
}

export class CategoryVectorRepository {
    constructor(private readonly supabase: any, private readonly embeddingService: OpenAIEmbeddingService) {}

    private static cosineSimilarity(a: number[], b: number[]): number {
        let dot = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    async findNearest(text: string): Promise<{ label: string; score: number }> {
        const { data, error } = await this.supabase
            .from('category_vectors')
            .select('id,label,embedding');

        if (error) {
            throw error;
        }
        if (!data) {
            throw new Error('No data returned from Supabase');
        }

        const embedding = await this.embeddingService.embed(text);

        let bestLabel = '';
        let bestScore = -Infinity;

        for (const row of data as CategoryVectorRow[]) {
            const score = CategoryVectorRepository.cosineSimilarity(embedding, row.embedding);
            if (score > bestScore) {
                bestScore = score;
                bestLabel = row.label;
            }
        }

        return { label: bestLabel, score: bestScore };
    }
}
