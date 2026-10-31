import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { AnalysisResult, ParsedTransaction, TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';
import { writtenNumbersIn } from '../src/modules/voiceProcessing/domain/writtenNumber';

jest.mock('../src/modules/voiceProcessing/infrastructure/openAITranscriptionService');

/**
 * FT-205: a number of a phrase took in any spaces and commas, so two amounts in a row without a word between them
 * were one — «кофе 25 000, 18 000» was 2 500 018 000. A space groups thousands only before exactly three digits.
 */
const NBSP = ' ';

function aiReading(...amounts: number[]): AnalysisResult {
  return {
    transactions: amounts.map((amount): ParsedTransaction => (
      { intent: 'transaction', amount, category: 'Другое', type: 'expense', date: '2026-10-31' }
    )),
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

const amountsWritten = (create: jest.Mock): number[] => create.mock.calls.map(([record]) => record.amount);

describe('two amounts in a row (FT-205)', () => {
  it.each([
    ['кофе 25 000, 18 000', ['25 000', '18 000']],
    ['обед 45000 5,10', ['45000', '5,10']],
    ['такси 18 000 45', ['18 000', '45']],
    ['кофе 25 000, такси 18 000', ['25 000', '18 000']],
    // A group of three after a number of more than three digits is a number of its own (review of PR #144)
    ['такси 25000 300', ['25000', '300']],
    ['обед 45000 500', ['45000', '500']],
  ])('«%s» writes the numbers %j', (text, numbers) => {
    expect(writtenNumbersIn(text).map(number => number.token)).toEqual(numbers);
  });

  it.each([
    ['кофе 25 000', '25 000'],
    ['кофе 28 000,00 UZS', '28 000,00'],
    [`кофе 28${NBSP}000,00${NBSP}UZS`, `28${NBSP}000,00`],
    ['кофе 1 234,50 сум', '1 234,50'],
    ['машина 1 234 567', '1 234 567'],
    ['машина 25 000 300', '25 000 300'],
    ['кофе 25 000.', '25 000'],
    // A phone number is one number, as before
    ['позвонить +998 90 123 45 67', '+998 90 123 45 67'],
  ])('«%s» writes one number, «%s»', (text, token) => {
    expect(writtenNumbersIn(text).map(number => number.token)).toEqual([token]);
  });

  it('says where each number starts', () => {
    expect(writtenNumbersIn('кофе 25 000, 18 000')).toEqual([{ token: '25 000', index: 5 }, { token: '18 000', index: 13 }]);
  });

  it.each(['кофе 25 000, 18 000', 'обед 45000 5,10', 'такси 25000 300', 'обед 45000 500'])('«%s» is not one amount: the AI reads it', async phrase => {
    const { analyzeInput, useCase } = makeText();

    await useCase.execute(phrase, 'user1');

    expect(analyzeInput).toHaveBeenCalledTimes(1);
  });

  it('writes the two amounts the AI reads from «кофе 25 000, 18 000», with nothing said about thousands', async () => {
    const { create, useCase } = makeText(aiReading(25_000, 18_000));

    const result = await useCase.execute('кофе 25 000, 18 000', 'user1');

    expect(amountsWritten(create)).toEqual([25_000, 18_000]);
    expect(result.transactions.flatMap(record => record.assumptions ?? [])).not.toContainEqual(expect.objectContaining({ kind: 'thousands' }));
  });

  it('reads a bare second number of «такси 18 000 45» as thousands, as it reads one alone', async () => {
    const { create, useCase } = makeText(aiReading(18_000, 45));

    const result = await useCase.execute('такси 18 000 45', 'user1');

    expect(amountsWritten(create)).toEqual([18_000, 45_000]);
    expect(result.transactions[1].assumptions).toContainEqual({ kind: 'thousands', written: '45', amount: 45_000 });
  });

  it('still reads «кофе 25 000, такси 18 000» as two amounts', async () => {
    const { create, useCase } = makeText(aiReading(25_000, 18_000));

    await useCase.execute('кофе 25 000, такси 18 000', 'user1');

    expect(amountsWritten(create)).toEqual([25_000, 18_000]);
  });

  it('pulls an AI that took a phone number for the amount back onto the marked one, as before', async () => {
    const { create, useCase } = makeText(aiReading(998_901_234_567));

    await useCase.execute('кофе 25000 сум +998 90 123 45 67', 'user1');

    expect(create.mock.calls[0][0]).toEqual(expect.objectContaining({ amount: 25_000, needsReview: true }));
  });
});
