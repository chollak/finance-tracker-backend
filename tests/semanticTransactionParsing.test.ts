import fs from 'fs/promises';
import { OpenAITranscriptionService } from '../src/modules/voiceProcessing/infrastructure/openAITranscriptionService';
import { ProcessVoiceInputUseCase } from '../src/modules/voiceProcessing/application/processVoiceInput';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';

describe('OpenAITranscriptionService transaction parsing - semanticType', () => {
  // Access the private parseTransactionItem method directly; no network calls are made.
  const service = new OpenAITranscriptionService('test-api-key') as unknown as {
    parseTransactionItem(item: any): { semanticType?: string; type: string } | null;
  };

  it('normalizes a valid semanticType returned by OpenAI', () => {
    const result = service.parseTransactionItem({
      intent: 'transaction',
      amount: 200000,
      category: 'other',
      type: 'expense',
      semanticType: 'own_transfer',
    });

    expect(result?.semanticType).toBe('own_transfer');
  });

  it('falls back to the legacy type when semanticType is missing', () => {
    const result = service.parseTransactionItem({
      intent: 'transaction',
      amount: 50000,
      category: 'salary',
      type: 'income',
    });

    expect(result?.semanticType).toBe('income');
  });

  it('falls back to the legacy type when semanticType is an unrecognized value', () => {
    const result = service.parseTransactionItem({
      intent: 'transaction',
      amount: 20000,
      category: 'food',
      type: 'expense',
      semanticType: 'crypto_trade',
    });

    expect(result?.semanticType).toBe('expense');
  });
});

describe('ProcessVoiceInputUseCase - semanticType flow-through', () => {
  const filePath = '/tmp/semantic-voice-test-input.ogg';

  beforeEach(async () => {
    await fs.writeFile(filePath, 'fake audio content');
  });

  afterEach(async () => {
    await fs.unlink(filePath).catch(() => {});
    await fs.unlink(filePath + '.mp3').catch(() => {});
  });

  it('passes semanticType from the transcription service through to the create payload and response', async () => {
    const openAIService = {
      transcribe: jest.fn().mockResolvedValue('снял наличные 100000'),
      analyzeInput: jest.fn().mockResolvedValue({
        transactions: [{
          intent: 'transaction',
          amount: 100000,
          category: 'other',
          type: 'expense',
          semanticType: 'cash_withdrawal',
          date: '2026-07-22',
          merchant: 'ATM',
        }],
        debts: [],
      }),
      analyzeTransactions: jest.fn(),
    } as unknown as TranscriptionService;

    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({ success: true, data: 'withdrawal-1' }),
    } as unknown as CreateTransactionUseCase;

    const useCase = new ProcessVoiceInputUseCase(openAIService, createTransactionUseCase);
    const result = await useCase.execute({ filePath, userId: 'user1' });

    expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
      semanticType: 'cash_withdrawal',
      originalParsing: expect.objectContaining({ semanticType: 'cash_withdrawal' }),
    }));
    expect(result.transactions).toEqual([
      expect.objectContaining({ id: 'withdrawal-1', semanticType: 'cash_withdrawal' }),
    ]);
  });

  it('normalizes a missing semanticType from the transcription service based on the legacy type', async () => {
    const openAIService = {
      transcribe: jest.fn().mockResolvedValue('зарплата 3000000'),
      analyzeInput: jest.fn().mockResolvedValue({
        transactions: [{
          intent: 'transaction',
          amount: 3000000,
          category: 'salary',
          type: 'income',
          date: '2026-07-22',
        }],
        debts: [],
      }),
      analyzeTransactions: jest.fn(),
    } as unknown as TranscriptionService;

    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({ success: true, data: 'salary-1' }),
    } as unknown as CreateTransactionUseCase;

    const useCase = new ProcessVoiceInputUseCase(openAIService, createTransactionUseCase);
    const result = await useCase.execute({ filePath, userId: 'user1' });

    expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
      semanticType: 'income',
    }));
    expect(result.transactions).toEqual([
      expect.objectContaining({ id: 'salary-1', semanticType: 'income' }),
    ]);
  });
});
