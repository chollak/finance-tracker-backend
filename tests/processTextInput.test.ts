import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';

jest.mock('../src/modules/voiceProcessing/infrastructure/openAITranscriptionService');

describe('ProcessTextInputUseCase', () => {
  it('creates transaction from text analysis', async () => {
    const openAIService = {
      analyzeInput: jest.fn().mockResolvedValue({
        transactions: [{
          intent: 'transaction',
          amount: 5,
          category: 'Food',
          type: 'expense',
          date: '2024-01-01'
        }],
        debts: []
      }),
      analyzeTransactions: jest.fn(),
      transcribe: jest.fn()
    } as unknown as TranscriptionService;

    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue('42')
    } as unknown as CreateTransactionUseCase;

    const useCase = new ProcessTextInputUseCase(openAIService, createTransactionUseCase);
    const result = await useCase.execute('test', 'user1');

    expect(createTransactionUseCase.execute).toHaveBeenCalled();
    expect(result).toEqual({
      text: 'test',
      transactions: [{
        id: '42',
        amount: 5,
        category: 'Food',
        type: 'expense',
        date: '2024-01-01',
        merchant: undefined,
        confidence: undefined,
        description: 'test'
      }],
      debts: []
    });
  });

  it('creates multiple transactions when text has more than one entry', async () => {
    const openAIService = {
      analyzeInput: jest.fn().mockResolvedValue({
        transactions: [
          { intent: 'transaction', amount: 5, category: 'Food', type: 'expense', date: '2024-01-01' },
          { intent: 'transaction', amount: 40, category: 'Debt', type: 'expense', date: '2024-01-01' }
        ],
        debts: []
      }),
      analyzeTransactions: jest.fn(),
      transcribe: jest.fn()
    } as unknown as TranscriptionService;

    const createTransactionUseCase = {
      execute: jest
        .fn()
        .mockResolvedValueOnce('1')
        .mockResolvedValueOnce('2')
    } as unknown as CreateTransactionUseCase;

    const useCase = new ProcessTextInputUseCase(openAIService, createTransactionUseCase);
    const result = await useCase.execute('text', 'user1');

    expect(createTransactionUseCase.execute).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      text: 'text',
      transactions: [
        {
          id: '1',
          amount: 5,
          category: 'Food',
          type: 'expense',
          date: '2024-01-01',
          merchant: undefined,
          confidence: undefined,
          description: 'text'
        },
        {
          id: '2',
          amount: 40,
          category: 'Debt',
          type: 'expense',
          date: '2024-01-01',
          merchant: undefined,
          confidence: undefined,
          description: 'text'
        }
      ],
      debts: []
    });
  });
});
