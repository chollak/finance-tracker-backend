import { CategoryVectorRepository } from '../src/modules/categoryRecommendation/infrastructure/CategoryVectorRepository';
import { OpenAIEmbeddingService } from '../src/infrastructure/openai/OpenAIEmbeddingService';

describe('CategoryVectorRepository', () => {
  it('returns label with highest cosine similarity', async () => {
    const supabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue({
        data: [
          { label: 'Food', embedding: [1, 0] },
          { label: 'Travel', embedding: [0, 1] },
        ],
        error: null,
      }),
    };

    const embeddingService: OpenAIEmbeddingService = {
      embed: jest.fn().mockResolvedValue(new Float32Array([1, 0])),
    } as unknown as OpenAIEmbeddingService;

    const repo = new CategoryVectorRepository(supabase, embeddingService);
    const result = await repo.findNearest('dummy');

    expect(supabase.from).toHaveBeenCalledWith('category_vectors');
    expect(result).toEqual({ label: 'Food', score: 1 });
  });
});
