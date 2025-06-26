import OpenAI from 'openai';
import { OpenAIEmbeddingService } from '../src/infrastructure/openai/OpenAIEmbeddingService';

jest.mock('openai');
jest.mock('axios', () => ({}), { virtual: true });

describe('OpenAIEmbeddingService', () => {
  it('requests embedding and returns Float32Array', async () => {
    const embedding = Array(1536).fill(1);
    const createMock = jest.fn().mockResolvedValue({ data: [{ embedding }] });
    (OpenAI as unknown as jest.Mock).mockImplementation(() => ({ embeddings: { create: createMock } }));

    const service = new OpenAIEmbeddingService('key');
    const vec = await service.embed('hello');

    expect(createMock).toHaveBeenCalledWith({
      model: 'text-embedding-3-small',
      input: 'hello',
      encoding_format: 'float',
    });
    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(1536);
  });
});
