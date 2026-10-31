import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { AnalysisResult, ParsedTransaction, TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';
import { readWrittenNumber } from '../src/modules/voiceProcessing/domain/writtenNumber';
import { parseAmountReply } from '../src/delivery/messaging/telegram/utils/amountReply';
import { OPENAI_PROMPTS } from '../src/shared/domain/constants/messages';

jest.mock('../src/modules/voiceProcessing/infrastructure/openAITranscriptionService');

/**
 * FT-224, two slips found by the second review of batch A (PR #144):
 * - a comma before three digits after a zero grouped thousands, though a point there no longer did (FT-206): «кофе
 *   0,500» was 500, and a bare number under a thousand is thousands — 500 000 сум, «"0,500" понял как 500 000». Now a
 *   comma groups thousands only after a head that is not zero, as a point does, and «0,500» is the decimal comma of
 *   FT-185: 0,5, and in сум 500 with «понял как», the same as «0.500»;
 * - the answer to «Сколько?» was glued into one number whatever its spaces: «25000 300» was 25 000 300 сум. In a phrase
 *   that is two numbers (FT-205); an answer with two numbers is not one amount, and the bot asks again.
 */
const NBSP = ' ';

function aiReading(...items: Array<Partial<ParsedTransaction>>): AnalysisResult {
  return {
    transactions: items.map((item): ParsedTransaction => ({
      intent: 'transaction',
      category: 'Другое',
      type: 'expense',
      date: '2026-10-31',
      amount: 0,
      ...item,
    })),
    debts: [],
  };
}

function makeText(ai: AnalysisResult = { transactions: [], debts: [] }) {
  const analyzeInput = jest.fn().mockResolvedValue(ai);
  const openAIService = { analyzeInput, analyzeTransactions: jest.fn(), transcribe: jest.fn() } as unknown as TranscriptionService;
  let created = 0;
  const createTransactionUseCase = {
    execute: jest.fn().mockImplementation(async () => ({ success: true, data: `record-${++created}` })),
  } as unknown as CreateTransactionUseCase;
  return {
    analyzeInput,
    create: createTransactionUseCase.execute as jest.Mock,
    useCase: new ProcessTextInputUseCase(openAIService, createTransactionUseCase),
  };
}

const writtenRecords = (create: jest.Mock): Array<{ amount: number; currency: string }> =>
  create.mock.calls.map(([record]) => ({ amount: record.amount, currency: record.currency }));
const thousandsNotes = (result: { transactions: Array<{ assumptions?: Array<{ kind: string }> }> }) =>
  result.transactions.flatMap(record => record.assumptions ?? []).filter(assumption => assumption.kind === 'thousands');

describe('a comma after a zero head (FT-224)', () => {
  it.each([
    ['0,500', 0.5],
    ['0,250', 0.25],
    ['0,005', 0.005],
    ['0,5000', 0.5],
  ])('reads «%s» as the fraction %d, as a point there is read', (token, value) => {
    expect(readWrittenNumber(token)).toBe(value);
    expect(readWrittenNumber(token.replace(',', '.'))).toBe(value);
  });

  it.each(['0,500,000', '0,500,00'])('reads no number from «%s», as from its point twin', token => {
    expect(readWrittenNumber(token)).toBeNull();
    expect(readWrittenNumber(token.replace(/,/g, '.'))).toBeNull();
  });

  // FT-185 and FT-206 as they were
  it.each([
    ['150,000', 150_000],
    ['1,500', 1_500],
    ['1,234,567', 1_234_567],
    [`28${NBSP}000,00`, 28_000],
    ['28 000,00', 28_000],
    ['1 234,50', 1_234.5],
    ['4,50', 4.5],
    ['1,5', 1.5],
    ['0,5', 0.5],
    ['0,50', 0.5],
    ['1.500', 1_500],
    ['25.000', 25_000],
    ['0.250', 0.25],
    ['4.50', 4.5],
  ])('still reads «%s» as %d', (token, value) => {
    expect(readWrittenNumber(token)).toBe(value);
  });

  describe('on the text fast path', () => {
    it.each(['кофе 0,500', 'кофе 0.500'])('«%s» is 500 сум, and the answer says so', async phrase => {
      const { analyzeInput, create, useCase } = makeText();

      const result = await useCase.execute(phrase, 'user1');

      expect(analyzeInput).not.toHaveBeenCalled();
      expect(writtenRecords(create)).toEqual([{ amount: 500, currency: 'UZS' }]);
      expect(thousandsNotes(result)).toEqual([{ kind: 'thousands', written: phrase.slice(5), amount: 500 }]);
    });

    it('«кофе 0,500 $» is half a dollar, as «0.500 $» is', async () => {
      const { create, useCase } = makeText();

      await useCase.execute('кофе 0,500 $', 'user1');

      expect(writtenRecords(create)).toEqual([{ amount: 0.5, currency: 'USD' }]);
    });

    // FT-185 and FT-206 as they were
    it.each([
      ['кофе 28 000,00', 28_000, 'UZS', []],
      ['кофе 1,5', 1_500, 'UZS', [{ kind: 'thousands', written: '1,5', amount: 1_500 }]],
      ['кофе 150,000', 150_000, 'UZS', []],
      ['кофе 1.500', 1_500, 'UZS', []],
      ['такси 25.000', 25_000, 'UZS', []],
    ])('«%s» is still %d %s', async (phrase, amount, currency, notes) => {
      const { create, useCase } = makeText();

      const result = await useCase.execute(phrase, 'user1');

      expect(writtenRecords(create)).toEqual([{ amount, currency }]);
      expect(thousandsNotes(result)).toEqual(notes);
    });
  });

  it('keeps «0,500 $» read by the AI as 0,5 $', async () => {
    const { create, useCase } = makeText(aiReading({ amount: 0.5, currency: 'USD' }, { amount: 25_000 }));

    await useCase.execute('чаевые 0,500 $ и кофе 25к', 'user1');

    expect(writtenRecords(create)).toEqual([{ amount: 0.5, currency: 'USD' }, { amount: 25_000, currency: 'UZS' }]);
  });

  it.each(['RU', 'EN'] as const)('the %s prompt says a zero head is no thousands group', language => {
    const prompt = OPENAI_PROMPTS[language].USER_ANALYZE_TRANSACTIONS('');

    expect(prompt).toContain('«0.250» = 0.25');
    expect(prompt).toContain('«0,500» = 0.5');
    // FT-206 as it was
    expect(prompt).toContain('«25.000» = 25000');
    expect(prompt).toContain('«150,000» = 150000');
  });

  it('reads «0,500» in the answer to «Сколько?» as 500 сум, and says it did', () => {
    expect(parseAmountReply('0,500', { currency: 'UZS' })).toEqual({ kind: 'amount', amountMinor: 50_000, currency: 'UZS', written: '0,500' });
    expect(parseAmountReply('0,500 $', { currency: 'UZS' })).toEqual({ kind: 'amount', amountMinor: 50, currency: 'USD' });
  });
});

describe('two numbers in an amount answer (FT-224)', () => {
  const sumExpense = { currency: 'UZS' as const };

  it.each([
    '25000 300',
    '25000 300 сум',
    '25000  300',
    '25 000, 18 000',
    '25, 30',
    '1 5',
    '25 3к',
    '60 5 $',
    '25000 300 нал',
  ])('«%s» is not one amount', text => {
    expect(parseAmountReply(text, sumExpense)).toEqual({ kind: 'several_numbers' });
  });

  it.each([
    ['25 000 300', 2_500_030_000],
    [`25${NBSP}000${NBSP}300`, 2_500_030_000],
    ['25 000', 2_500_000],
    ['25000', 2_500_000],
    ['28 000,00', 2_800_000],
    ['1 234,50 сум', 123_500],
    ['150 000', 15_000_000],
    ['1,2,3', 1_230_000],
  ])('«%s» is still one amount, %i minor units of сум', (text, amountMinor) => {
    expect(parseAmountReply(text, sumExpense)).toEqual(expect.objectContaining({ kind: 'amount', amountMinor, currency: 'UZS' }));
  });

  it('is still no answer at all when a word stands between the numbers', () => {
    expect(parseAmountReply('25 и 30', sumExpense)).toBeNull();
    expect(parseAmountReply('кофе 25000 300', sumExpense)).toBeNull();
  });
});
