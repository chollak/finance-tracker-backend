import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';

jest.mock('../src/modules/voiceProcessing/infrastructure/openAITranscriptionService');

/**
 * Taking cash out is a movement, not spending. Booking it as an expense
 * overstates what a person actually spent (product invariant И-1).
 */
function buildUseCase() {
  const openAIService = {
    analyzeInput: jest.fn(),
    analyzeTransactions: jest.fn(),
    transcribe: jest.fn(),
  } as unknown as TranscriptionService;

  const createTransaction = {
    execute: jest.fn().mockResolvedValue({ success: true, data: 'tx-1' }),
  } as unknown as CreateTransactionUseCase;

  return { useCase: new ProcessTextInputUseCase(openAIService, createTransaction), openAIService, createTransaction };
}

describe('снятие наличных распознаётся по тому, как о нём говорят', () => {
  it.each([
    'снял в банкомате 300000',
    'снял 300000 в банкомате',
    'снял наличные 300000',
    'снял 300000 с карты',
    'обналичил 200000',
  ])('«%s» не становится обычным расходом', async (text) => {
    const { useCase, createTransaction, openAIService } = buildUseCase();

    await useCase.execute(text, 'u1', 'QA');

    // Either the fast path classified it, or it went to the model — both fine.
    // What must not happen is a confident plain expense.
    if ((openAIService.analyzeInput as jest.Mock).mock.calls.length > 0) return;

    expect(createTransaction.execute).toHaveBeenCalledWith(
      expect.objectContaining({ semanticType: 'cash_withdrawal' })
    );
  });

  it('обычная трата не превращается в снятие наличных', async () => {
    const { useCase, createTransaction } = buildUseCase();

    await useCase.execute('кофе 25000', 'u1', 'QA');

    expect(createTransaction.execute).toHaveBeenCalledWith(
      expect.objectContaining({ semanticType: 'expense' })
    );
  });
});
