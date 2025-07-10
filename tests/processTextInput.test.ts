import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';

jest.mock('../src/modules/voiceProcessing/infrastructure/openAITranscriptionService');

describe('ProcessTextInputUseCase', () => {
  it('creates transaction from text analysis', async () => {
    const openAIService = {
      analyzeTransactions: jest.fn().mockResolvedValue([{ amount: 5, category: 'Food', type: 'expense', date: '2024-01-01' }]),
      transcribe: jest.fn()
    } as unknown as TranscriptionService;

    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue('42')
    } as unknown as CreateTransactionUseCase;

    const useCase = new ProcessTextInputUseCase(openAIService, createTransactionUseCase);
    const result = await useCase.execute('test', 'user1');

    expect(createTransactionUseCase.execute).toHaveBeenCalled();
    expect(result).toEqual({ text: 'test', transactions: [{ id: '42', amount: 5, category: 'Food', type: 'expense', date: '2024-01-01' }] });
  });
});
