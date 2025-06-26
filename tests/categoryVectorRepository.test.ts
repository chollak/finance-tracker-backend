import { CategoryVectorRepository } from '../src/modules/categoryRecommendation/infrastructure/CategoryVectorRepository';
import { OpenAIEmbeddingService } from '../src/infrastructure/openai/OpenAIEmbeddingService';

describe('CategoryVectorRepository', () => {
  it('finds nearest label by cosine similarity', async () => {
    const select = jest.fn().mockResolvedValue({
      data: [
        { id: 1, label: 'Food', embedding: [1, 0] },
        { id: 2, label: 'Rent', embedding: [0, 1] }
      ],
      error: null
    });
    const from = jest.fn().mockReturnValue({ select });
    const supabase = { from } as any;

    const embeddingService = {
      embed: jest.fn().mockResolvedValue([1, 0])
    } as unknown as OpenAIEmbeddingService;

    const repo = new CategoryVectorRepository(supabase, embeddingService);
    const result = await repo.findNearest('sample');

    expect(from).toHaveBeenCalledWith('category_vectors');
    expect(embeddingService.embed).toHaveBeenCalledWith('sample');
    expect(result.label).toBe('Food');
    expect(result.score).toBeCloseTo(1);
  });
});
