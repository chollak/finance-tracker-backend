import OpenAI from 'openai';
import { OpenAIChatService } from '../src/infrastructure/openai/OpenAIChatService';
import { TransactionDTO } from '../src/core/dto/TransactionDTO';

jest.mock('openai');

describe('OpenAIChatService', () => {
  it('parses tool_call into TransactionDTO', async () => {
    const createMock = jest.fn().mockResolvedValue({
      choices: [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'add_transaction',
                  arguments: JSON.stringify({
                    amount: 20,
                    currency: 'USD',
                    type: 'expense',
                    account: 'cash',
                    category: 'food'
                  })
                }
              }
            ]
          }
        }
      ]
    });

    (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
      chat: { completions: { create: createMock } }
    }));

    const tools: any[] = [];
    const service = new OpenAIChatService('key', tools);
    const dto = await service.extractTransaction('sample');

    expect(createMock).toHaveBeenCalledWith({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'sample' }],
      tools
    });
    expect(dto).toBeInstanceOf(TransactionDTO);
    expect(dto.amount).toBe(20);
    expect(dto.currency).toBe('USD');
  });
});
