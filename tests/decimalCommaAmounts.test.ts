import fs from 'fs/promises';
import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { ProcessVoiceInputUseCase } from '../src/modules/voiceProcessing/application/processVoiceInput';
import { AnalysisResult, ParsedTransaction, TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';
import { readWrittenNumber } from '../src/modules/voiceProcessing/domain/writtenNumber';

jest.mock('../src/modules/voiceProcessing/infrastructure/openAITranscriptionService');

/**
 * FT-185: Wallet writes a payment as «28 000,00 UZS» — groups split by a (non-breaking) space, kopecks after a
 * comma, the code after the number. The text fast path took the comma for a thousands separator and wrote
 * 2 800 000 сум. A comma before one or two digits at the end is the decimal one; before three, a thousands group.
 */
const NBSP = ' ';

function aiReading(amount: number, extra: Partial<ParsedTransaction> = {}): AnalysisResult {
  return {
    transactions: [{ intent: 'transaction', amount, category: 'Другое', type: 'expense', date: '2026-10-30', ...extra }],
    debts: [],
  };
}

function makeText(ai: AnalysisResult | Error = { transactions: [], debts: [] }) {
  const analyzeInput = ai instanceof Error ? jest.fn().mockRejectedValue(ai) : jest.fn().mockResolvedValue(ai);
  const openAIService = { analyzeInput, analyzeTransactions: jest.fn(), transcribe: jest.fn() } as unknown as TranscriptionService;
  const createTransactionUseCase = {
    execute: jest.fn().mockResolvedValue({ success: true, data: 'record-1' }),
  } as unknown as CreateTransactionUseCase;
  return {
    analyzeInput,
    create: createTransactionUseCase.execute as jest.Mock,
    useCase: new ProcessTextInputUseCase(openAIService, createTransactionUseCase),
  };
}

function written(create: jest.Mock): { amount: number; currency: string; needsReview: boolean } {
  expect(create).toHaveBeenCalledTimes(1);
  return create.mock.calls[0][0];
}

describe('a decimal comma in a phrase (FT-185)', () => {
  it.each([
    [`28${NBSP}000,00`, 28_000],
    ['28 000,00', 28_000],
    ['28000,00', 28_000],
    ['1 234,50', 1_234.5],
    ['4,5', 4.5],
    ['150,000', 150_000],
    ['1,234,567', 1_234_567],
    ['28,000.50', 28_000.5],
    ['4.50', 4.5],
    ['25 000', 25_000],
    ['500', 500],
  ])('reads «%s» as %d', (token, value) => {
    expect(readWrittenNumber(token)).toBe(value);
  });

  it.each(['1.234.567', '1.234,50'])('reads no number from «%s»', token => {
    expect(readWrittenNumber(token)).toBeNull();
  });

  describe('on the text fast path', () => {
    it.each([
      [`Ooo Mazzali Super Food 28${NBSP}000,00${NBSP}UZS`, 28_000, 'UZS'],
      ['Ooo Mazzali Super Food 28 000,00 UZS', 28_000, 'UZS'],
      ['кофе 28 000,00', 28_000, 'UZS'],
      ['кофе 28000,00', 28_000, 'UZS'],
      ['кофе 1 234,50 сум', 1_234.5, 'UZS'],
      ['кофе 4,50 $', 4.5, 'USD'],
      ['кофе 25 000', 25_000, 'UZS'],
      ['кофе 25000', 25_000, 'UZS'],
      // Three digits after a comma are a thousands group, as before
      ['кофе 150,000', 150_000, 'UZS'],
      ['зарплата 28 000,00', 28_000, 'UZS'],
    ])('«%s» is %d %s without asking the AI', async (phrase, amount, currency) => {
      const { analyzeInput, create, useCase } = makeText();

      await useCase.execute(phrase, 'user1');

      expect(analyzeInput).not.toHaveBeenCalled();
      expect(written(create)).toEqual(expect.objectContaining({ amount, currency }));
    });

    it.each([
      ['кофе 25к', 25_000],
      ['кофе 500', 500_000],
      ['такси 1.5к', 1_500],
    ])('«%s» is still %d', async (phrase, amount) => {
      const { analyzeInput, create, useCase } = makeText();

      await useCase.execute(phrase, 'user1');

      expect(analyzeInput).not.toHaveBeenCalled();
      expect(written(create)).toEqual(expect.objectContaining({ amount }));
    });

    it('says nothing about thousands for an amount written in full', async () => {
      const { useCase } = makeText();

      const result = await useCase.execute('кофе 150,000', 'user1');

      expect(result.transactions[0].assumptions).not.toContainEqual(expect.objectContaining({ kind: 'thousands' }));
    });
  });

  describe('when the AI reads the phrase', () => {
    it('keeps a simple phrase\'s own reading right when the AI fails', async () => {
      const { analyzeInput, create, useCase } = makeText(new Error('OpenAI is down'));

      await useCase.execute('Mazzali 28 000,00 UZS', 'user1');

      expect(analyzeInput).toHaveBeenCalledTimes(1);
      expect(written(create)).toEqual(expect.objectContaining({ amount: 28_000 }));
    });

    it('pulls a misread trailing number back onto the marked decimal amount', async () => {
      const { create, useCase } = makeText(aiReading(1_788_405_366));

      await useCase.execute('Mazzali 28 000,00 UZS 1788405366', 'user1');

      expect(written(create)).toEqual(expect.objectContaining({ amount: 28_000, needsReview: true }));
    });

    it('leaves «4.50 USD» to the AI, which reads 4.5 dollars', async () => {
      const { analyzeInput, create, useCase } = makeText(aiReading(4.5, { currency: 'USD' }));

      await useCase.execute('кофе 4.50 USD', 'user1');

      expect(analyzeInput).toHaveBeenCalledTimes(1);
      expect(written(create)).toEqual(expect.objectContaining({ amount: 4.5, currency: 'USD' }));
    });

    it('leaves «3,2 млн» to the AI, which reads 3 200 000', async () => {
      const { analyzeInput, create, useCase } = makeText(aiReading(3_200_000));

      await useCase.execute('такси 3,2 млн', 'user1');

      expect(analyzeInput).toHaveBeenCalledTimes(1);
      expect(written(create)).toEqual(expect.objectContaining({ amount: 3_200_000 }));
    });
  });

  describe('in a voice message', () => {
    const filePath = '/tmp/ft185-voice-test-input.ogg';

    beforeEach(async () => {
      await fs.writeFile(filePath, 'fake audio content');
    });

    afterEach(async () => {
      await fs.unlink(filePath).catch(() => {});
      await fs.unlink(filePath + '.mp3').catch(() => {});
    });

    it.each([
      ['кофе 28 000,00 сум', aiReading(28_000), 28_000, 'UZS'],
      ['кофе 4,50 доллара', aiReading(4.5, { currency: 'USD' }), 4.5, 'USD'],
    ])('«%s» is written as the AI read it', async (heard, ai, amount, currency) => {
      const openAIService = {
        transcribe: jest.fn().mockResolvedValue(heard),
        analyzeInput: jest.fn().mockResolvedValue(ai),
        analyzeTransactions: jest.fn(),
      } as unknown as TranscriptionService;
      const createTransactionUseCase = {
        execute: jest.fn().mockResolvedValue({ success: true, data: 'voice-1' }),
      } as unknown as CreateTransactionUseCase;

      await new ProcessVoiceInputUseCase(openAIService, createTransactionUseCase).execute({ filePath, userId: 'user1' });

      expect(written(createTransactionUseCase.execute as jest.Mock)).toEqual(expect.objectContaining({ amount, currency }));
    });
  });
});
