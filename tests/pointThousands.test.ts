import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { AnalysisResult, ParsedTransaction, TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';
import { captureAssumptions } from '../src/modules/voiceProcessing/application/captureAssumptions';
import { readWrittenNumber } from '../src/modules/voiceProcessing/domain/writtenNumber';
import { parseAmountReply } from '../src/delivery/messaging/telegram/utils/amountReply';
import { OPENAI_PROMPTS } from '../src/shared/domain/constants/messages';

jest.mock('../src/modules/voiceProcessing/infrastructure/openAITranscriptionService');

/**
 * FT-206: «25.000» was 25 — a point read as `Number` reads it — and then 25 000 by «a bare number under a thousand is
 * thousands», with «"25.000" понял как 25 000» in the answer; the AI once read «1.500» as 1,5. Shukur, 2026-10-31: a
 * point before exactly three digits groups thousands, in dollars too («4.500 $» is 4 500 $); before one or two it is a
 * fraction («4.50 $» is 4,50 $), and a bare fraction in сум is thousands, as in FT-185 («1.5» is 1 500).
 */
function aiReading(...items: Array<number | Partial<ParsedTransaction>>): AnalysisResult {
  return {
    transactions: items.map((item): ParsedTransaction => ({
      intent: 'transaction',
      category: 'Другое',
      type: 'expense',
      date: '2026-10-31',
      ...(typeof item === 'number' ? { amount: item } : { amount: 0, ...item }),
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

describe('a point as a thousands separator (FT-206)', () => {
  it.each([
    ['25.000', 25_000],
    ['1.500', 1_500],
    ['150.000', 150_000],
    ['4.500', 4_500],
    ['1.234.567', 1_234_567],
    ['1.234,50', 1_234.5],
    ['4.50', 4.5],
    ['1.5', 1.5],
    ['9.99', 9.99],
    ['28,000.50', 28_000.5],
  ])('reads «%s» as %d', (token, value) => {
    expect(readWrittenNumber(token)).toBe(value);
  });

  // A leading zero is no thousands group: «0.250» is a quarter (review of PR #144)
  it.each([
    ['0.250', 0.25],
    ['0.005', 0.005],
  ])('reads «%s» as the fraction %d', (token, value) => {
    expect(readWrittenNumber(token)).toBe(value);
  });

  it.each(['1.234.5', '1.23.456'])('reads no number from «%s»', token => {
    expect(readWrittenNumber(token)).toBeNull();
  });

  it.each([
    ['1.5', 1.5],
    ['1.500', 1.5],
    ['3,2', 3.2],
    ['25', 25],
  ])('before «к», «тыс», «млн» reads «%s» as a fraction, %d', (token, value) => {
    expect(readWrittenNumber(token, { beforeMagnitude: true })).toBe(value);
  });

  it('reads no number before a magnitude word from «1.234.567»', () => {
    expect(readWrittenNumber('1.234.567', { beforeMagnitude: true })).toBeNull();
  });

  describe('on the text fast path', () => {
    it.each([
      ['кофе 1.500', 1_500, 'UZS'],
      ['такси 25.000', 25_000, 'UZS'],
      ['кофе 150.000', 150_000, 'UZS'],
      ['кофе 4.500 $', 4_500, 'USD'],
      ['такси 1.234.567', 1_234_567, 'UZS'],
    ])('«%s» is %d %s without asking the AI, with nothing said about thousands', async (phrase, amount, currency) => {
      const { analyzeInput, create, useCase } = makeText();

      const result = await useCase.execute(phrase, 'user1');

      expect(analyzeInput).not.toHaveBeenCalled();
      expect(writtenRecords(create)).toEqual([{ amount, currency }]);
      expect(thousandsNotes(result)).toEqual([]);
    });

    it.each([
      ['такси 1.5к', 1_500],
      ['такси 1.500 млн', 1_500_000],
    ])('«%s» is still %d: before a magnitude word the point is a fraction', async (phrase, amount) => {
      const { analyzeInput, create, useCase } = makeText();

      await useCase.execute(phrase, 'user1');

      expect(analyzeInput).not.toHaveBeenCalled();
      expect(writtenRecords(create)).toEqual([{ amount, currency: 'UZS' }]);
    });

    it('still ends a sentence at a point not between digits', async () => {
      const { analyzeInput, useCase } = makeText(aiReading(25_000, 18_000));

      await useCase.execute('кофе 25000. такси 18000', 'user1');

      expect(analyzeInput).toHaveBeenCalledTimes(1);
    });
  });

  describe('when the AI reads the phrase', () => {
    it('writes «кофе 1.500 и такси 25.000» as read, with nothing said about thousands', async () => {
      const { create, useCase } = makeText(aiReading(1_500, 25_000));

      const result = await useCase.execute('кофе 1.500 и такси 25.000', 'user1');

      expect(writtenRecords(create)).toEqual([{ amount: 1_500, currency: 'UZS' }, { amount: 25_000, currency: 'UZS' }]);
      expect(thousandsNotes(result)).toEqual([]);
    });

    it('takes «1.500» read as 1,5 for 1 500, and says nothing about thousands', async () => {
      const { create, useCase } = makeText(aiReading(1.5, 25));

      const result = await useCase.execute('кофе 1.500 и такси 25.000', 'user1');

      expect(writtenRecords(create)).toEqual([{ amount: 1_500, currency: 'UZS' }, { amount: 25_000, currency: 'UZS' }]);
      expect(thousandsNotes(result)).toEqual([]);
    });

    it('takes «4.500 $» read as 4,5 for 4 500 $, and an income\'s «1.500» for 1 500', async () => {
      const { create, useCase } = makeText(aiReading(
        { amount: 4.5, currency: 'USD' },
        { amount: 1.5, type: 'income', semanticType: 'income' },
      ));

      await useCase.execute('подписка 4.500 $ и кэшбэк 1.500', 'user1');

      expect(writtenRecords(create)).toEqual([{ amount: 4_500, currency: 'USD' }, { amount: 1_500, currency: 'UZS' }]);
    });

    it('keeps «0.250 $» read as 0,25 $: a leading zero is no thousands group', async () => {
      const { create, useCase } = makeText(aiReading({ amount: 0.25, currency: 'USD' }, 25_000));

      await useCase.execute('чаевые 0.250 $ и кофе 25к', 'user1');

      expect(writtenRecords(create)).toEqual([{ amount: 0.25, currency: 'USD' }, { amount: 25_000, currency: 'UZS' }]);
    });

    it('keeps a fraction the phrase writes as one: «4.50 $» is 4,50 $', async () => {
      const { create, useCase } = makeText(aiReading({ amount: 4.5, currency: 'USD' }));

      await useCase.execute('кофе 4.50 $', 'user1');

      expect(writtenRecords(create)).toEqual([{ amount: 4.5, currency: 'USD' }]);
    });

    it('reads a bare «1.5» in сум as 1 500, as in FT-185, and says so', async () => {
      const { create, useCase } = makeText(aiReading(1.5));

      const result = await useCase.execute('кофе 1.5', 'user1');

      expect(writtenRecords(create)).toEqual([{ amount: 1_500, currency: 'UZS' }]);
      expect(thousandsNotes(result)).toEqual([{ kind: 'thousands', written: '1.5', amount: 1_500 }]);
    });

    it('leaves «1,5» of «чай 1.5 и кофе 1.500» to the tea: a number written as it is read is not a misread', async () => {
      const { create, useCase } = makeText(aiReading(1.5, 1_500));

      await useCase.execute('чай 1.5 и кофе 1.500', 'user1');

      expect(writtenRecords(create)).toEqual([{ amount: 1_500, currency: 'UZS' }, { amount: 1_500, currency: 'UZS' }]);
    });
  });

  it('does not say «"25.000" понял как 25 000»', () => {
    const assumptions = captureAssumptions({
      text: 'такси 25.000',
      amount: 25_000,
      category: { name: 'Такси', type: 'expense', presetKey: 'taxi', chosenBy: 'ai', words: 'такси' },
      currency: 'UZS',
    });

    expect(assumptions).not.toContainEqual(expect.objectContaining({ kind: 'thousands' }));
  });

  it.each(['RU', 'EN'] as const)('the %s prompt tells the AI the rule', language => {
    const prompt = OPENAI_PROMPTS[language].USER_ANALYZE_TRANSACTIONS('');

    expect(prompt).toContain('«25.000» = 25000');
    expect(prompt).toContain('«1.500» = 1500');
    expect(prompt).toContain('«4.50» = 4.5');
  });

  describe('in the answer to «Сколько?»', () => {
    const sumExpense = { currency: 'UZS' as const };

    it.each([
      ['25.000', 2_500_000, 'UZS'],
      ['1.500', 150_000, 'UZS'],
      ['150.000', 15_000_000, 'UZS'],
      ['4.500 $', 450_000, 'USD'],
      ['4.50 $', 450, 'USD'],
      ['1.234,50', 123_500, 'UZS'],
      ['1.500 млн', 150_000_000, 'UZS'],
      ['0.250 $', 25, 'USD'],
    ])('«%s» is %i minor units of %s', (text, amountMinor, currency) => {
      expect(parseAmountReply(text, sumExpense)).toEqual({ kind: 'amount', amountMinor, currency });
    });

    it('reads a bare «1.5» as 1 500 сум, and says it did', () => {
      expect(parseAmountReply('1.5', sumExpense)).toEqual({ kind: 'amount', amountMinor: 150_000, currency: 'UZS', written: '1.5' });
    });
  });
});
