import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { OpenAITranscriptionService } from '../src/modules/voiceProcessing/infrastructure/openAITranscriptionService';
import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';

jest.mock('../src/modules/voiceProcessing/infrastructure/openAITranscriptionService');

describe('ProcessTextInputUseCase', () => {
  it('creates transaction from text analysis', async () => {
    const openAIService = {
      analyzeText: jest.fn().mockResolvedValue({ amount: 5, category: 'Food', type: 'expense' }),
      transcribe: jest.fn()
    } as unknown as OpenAITranscriptionService;

    const createTransactionUseCase = {
      execute: jest.fn()
    } as unknown as CreateTransactionUseCase;

    const useCase = new ProcessTextInputUseCase(openAIService, createTransactionUseCase);
    const result = await useCase.execute('test');

    expect(createTransactionUseCase.execute).toHaveBeenCalled();
    expect(result).toEqual({ text: 'test', amount: 5, category: 'Food', type: 'expense' });
  });
});
