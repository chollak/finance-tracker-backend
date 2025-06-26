import OpenAI from 'openai';
import { OpenAIModerationService } from '../src/infrastructure/openai/OpenAIModerationService';

jest.mock('openai');
jest.mock('axios', () => ({}), { virtual: true });
describe('OpenAIModerationService', () => {
  it('returns true when not blocked', async () => {
    const createMock = jest.fn().mockResolvedValue({ results: [{ blocked: false }] });
    (OpenAI as unknown as jest.Mock).mockImplementation(() => ({ moderations: { create: createMock } }));

    const client = new OpenAI({ apiKey: 'key' });
    const service = new OpenAIModerationService(client);
    const allowed = await service.isAllowed('hello');

    expect(createMock).toHaveBeenCalledWith({ input: 'hello' });
    expect(allowed).toBe(true);
  });
});

