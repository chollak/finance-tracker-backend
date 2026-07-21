import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';
import { CreateDebtUseCase } from '../src/modules/debt/application/createDebt';
import { DebtStatus, DebtType } from '../src/modules/debt/domain/debtEntity';

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

    // Return Result<string> pattern
    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({ success: true, data: '42' })
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

    // Return Result<string> pattern
    const createTransactionUseCase = {
      execute: jest
        .fn()
        .mockResolvedValueOnce({ success: true, data: '1' })
        .mockResolvedValueOnce({ success: true, data: '2' })
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

  it('handles failed transaction creation gracefully', async () => {
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

    // Return failure Result
    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({ success: false, error: new Error('DB error') })
    } as unknown as CreateTransactionUseCase;

    const useCase = new ProcessTextInputUseCase(openAIService, createTransactionUseCase);
    const result = await useCase.execute('test', 'user1');

    expect(createTransactionUseCase.execute).toHaveBeenCalled();
    // Should return empty transactions when creation fails
    expect(result.transactions).toHaveLength(0);
  });

  it('does not report the debt id as linkedTransactionId when the debt result has no transaction id', async () => {
    const openAIService = {
      analyzeInput: jest.fn().mockResolvedValue({
        transactions: [],
        debts: [{
          debtType: 'owed_to_me',
          personName: 'Bob',
          amount: 100,
          dueDate: null,
          description: 'lent Bob 100',
          moneyTransferred: true,
          confidence: 0.9,
        }],
      }),
      analyzeTransactions: jest.fn(),
      transcribe: jest.fn(),
    } as unknown as TranscriptionService;

    const createTransactionUseCase = {
      execute: jest.fn(),
    } as unknown as CreateTransactionUseCase;
    const createDebtUseCase = {
      execute: jest.fn().mockResolvedValue({
        success: true,
        data: {
          id: 'debt-1',
          userId: 'user1',
          type: DebtType.OWED_TO_ME,
          personName: 'Bob',
          originalAmount: 100,
          remainingAmount: 100,
          currency: 'UZS',
          status: DebtStatus.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    } as unknown as CreateDebtUseCase;

    const useCase = new ProcessTextInputUseCase(openAIService, createTransactionUseCase, createDebtUseCase);

    const result = await useCase.execute('lent Bob 100', 'user1');

    expect(result.debts).toEqual([
      expect.objectContaining({
        id: 'debt-1',
        linkedTransactionId: undefined,
      }),
    ]);
  });
});
