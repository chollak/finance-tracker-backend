import OpenAI from 'openai';
import { OpenAIEmbeddingService } from '../src/infrastructure/openai/OpenAIEmbeddingService';

jest.mock('openai');
jest.mock('axios', () => ({}), { virtual: true });

describe('OpenAIEmbeddingService', () => {
  it('requests embedding and returns Float32Array', async () => {
    const createMock = jest.fn().mockResolvedValue({ data: [{ embedding: [1, 2] }] });
    (OpenAI as unknown as jest.Mock).mockImplementation(() => ({ embeddings: { create: createMock } }));

    const service = new OpenAIEmbeddingService('key');
    const vec = await service.embed('hello');

    expect(createMock).toHaveBeenCalledWith({ model: 'text-embedding-3-small', input: 'hello' });
    expect(vec).toBeInstanceOf(Float32Array);
    expect(Array.from(vec)).toEqual([1, 2]);
  });
});
