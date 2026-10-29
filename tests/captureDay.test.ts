import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';
import { OpenAITranscriptionService } from '../src/modules/voiceProcessing/infrastructure/openAITranscriptionService';
import { buildCaptureAck } from '../src/modules/quickCapture/application/buildCaptureAck';

/**
 * FT-175: the day of a record is counted on the user's calendar (Tashkent), from the day the phrase was said.
 * 2026-10-28T20:30Z is 01:30 on Thursday the 29th in Tashkent — the UTC day is still the 28th.
 */
const TASHKENT_NIGHT = new Date('2026-10-28T20:30:00.000Z');

function parser(result: Partial<Awaited<ReturnType<TranscriptionService['analyzeInput']>>> = {}) {
  return {
    analyzeInput: jest.fn().mockResolvedValue({ transactions: [], debts: [], ...result }),
    analyzeTransactions: jest.fn(),
    transcribe: jest.fn(),
  };
}

function creator() {
  const execute = jest.fn().mockResolvedValue({ success: true, data: 'tx-1' });
  return { useCase: { execute } as unknown as CreateTransactionUseCase, execute };
}

const writtenDate = (execute: jest.Mock) => execute.mock.calls[0][0].date;

/** A chat completion as the OpenAI API answers it; the request body is kept for the test to read. */
function completionFetch(items: unknown[]) {
  const requests: Array<{ messages: Array<{ role: string; content: string }> }> = [];
  const fetch = jest.fn(async (_url: unknown, init?: { body?: unknown }) => {
    requests.push(JSON.parse(String(init?.body)));
    const body = {
      id: 'chatcmpl-1', object: 'chat.completion', created: 0, model: 'test',
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ items }) } }],
    };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  return { fetch, requests };
}

describe('the day of a record is the user\'s day, not the UTC day', () => {
  afterEach(() => jest.useRealTimers());

  it('writes a fast-path record on the Tashkent day after midnight there', async () => {
    jest.useFakeTimers().setSystemTime(TASHKENT_NIGHT);
    const create = creator();

    await new ProcessTextInputUseCase(parser() as unknown as TranscriptionService, create.useCase).execute('перевел 500000 на Alif', 'user-1');

    expect(writtenDate(create.execute)).toBe('2026-10-29');
  });

  it('tells the AI the Tashkent day after midnight there', async () => {
    jest.useFakeTimers().setSystemTime(TASHKENT_NIGHT);
    const { fetch, requests } = completionFetch([{ intent: 'transaction', amount: 45000, category: 'Кафе', type: 'expense' }]);
    const service = new OpenAITranscriptionService('test-api-key', { fetch: fetch as never });

    const result = await service.analyzeInput('кофе 25000 и обед 45000');

    expect(requests[0].messages[0].content).toContain('Сегодня 2026-10-29, четверг');
    // An item the model gave no date gets that day too
    expect(result.transactions[0].date).toBe('2026-10-29');
  });

  it('writes a record named «вчера» on the Tashkent yesterday after midnight there', async () => {
    jest.useFakeTimers().setSystemTime(TASHKENT_NIGHT);
    const create = creator();

    await new ProcessTextInputUseCase(parser() as unknown as TranscriptionService, create.useCase).execute('вчера такси 18000', 'user-1');

    expect(writtenDate(create.execute)).toBe('2026-10-28');
  });

  it('calls the record of the Tashkent day «Сегодня» after midnight there', () => {
    jest.useFakeTimers().setSystemTime(TASHKENT_NIGHT);

    const ack = buildCaptureAck([{
      id: 'tx-1', amount: 18000, type: 'expense', semanticType: 'expense', category: 'Транспорт', description: 'такси',
      date: '2026-10-29', needsReview: false, countsAsRealExpense: true,
    }]);

    expect(ack.details).toBe('Сегодня');
  });
});

describe('the fast paths count the day from the day the phrase was said (FT-175)', () => {
  // Tuesday; the server's clock is days later, as for a phrase that waited in the phone's queue
  const SAID_ON = '2026-10-27';
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-10-29T12:00:00.000Z')));
  afterEach(() => jest.useRealTimers());

  async function capture(text: string, today?: string) {
    const ai = parser();
    const create = creator();
    await new ProcessTextInputUseCase(ai as unknown as TranscriptionService, create.useCase)
      .execute(text, 'user-1', undefined, today ? { today } : {});
    return { ai, create };
  }

  it.each([
    ['перевел 500000 на Alif', '2026-10-27'],
    ['вчера перевел 500000 на Alif', '2026-10-26'],
    ['зарплата 5000000 позавчера', '2026-10-25'],
    ['сегодня снял 300000 с карты', '2026-10-27'],
  ])('reads «%s» as the record of %s without the AI', async (text, date) => {
    const { ai, create } = await capture(text, SAID_ON);

    expect(ai.analyzeInput).not.toHaveBeenCalled();
    expect(writtenDate(create.execute)).toBe(date);
  });

  it('keeps the day word out of the record: «вчера такси 18000» is a taxi of the day before', async () => {
    const { ai, create } = await capture('вчера такси 18000', SAID_ON);

    expect(ai.analyzeInput).not.toHaveBeenCalled();
    expect(create.execute).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-10-26', category: 'Транспорт', description: 'такси', merchant: 'такси', amount: 18000 }),
      expect.anything()
    );
  });

  it('writes a phrase without a day on the day it was said', async () => {
    const { create } = await capture('такси 18000', SAID_ON);

    expect(writtenDate(create.execute)).toBe(SAID_ON);
  });

  it('without the day it was said, counts from the server\'s today as before', async () => {
    const { create } = await capture('вчера такси 18000');

    expect(writtenDate(create.execute)).toBe('2026-10-28');
  });

  it.each([
    'в понедельник такси 18000',
    'такси 18000 в субботу',
    'неделю назад такси 18000',
    'завтра такси 18000',
    'вчера позавчера такси 18000',
  ])('hands «%s» to the AI with the day it was said: the fast path does not read that day', async text => {
    const { ai } = await capture(text, SAID_ON);

    expect(ai.analyzeInput).toHaveBeenCalledWith(text, expect.objectContaining({ today: SAID_ON }));
  });

  it('tells the AI the day it was said for a phrase it reads, and dates an item it gave no day by it', async () => {
    const ai = parser();
    const create = creator();
    ai.analyzeInput.mockResolvedValue({
      transactions: [{ intent: 'transaction', amount: 25000, category: 'Кафе', type: 'expense', description: 'кофе' }],
      debts: [],
    });

    await new ProcessTextInputUseCase(ai as unknown as TranscriptionService, create.useCase)
      .execute('кофе 25000 и такси 18000', 'user-1', undefined, { today: SAID_ON });

    expect(ai.analyzeInput).toHaveBeenCalledWith('кофе 25000 и такси 18000', expect.objectContaining({ today: SAID_ON }));
    expect(writtenDate(create.execute)).toBe(SAID_ON);
  });
});

describe('the AI is told the day the phrase was said (FT-175)', () => {
  it('puts that day and its weekday into the prompt and dates an item without a day by it', async () => {
    const { fetch, requests } = completionFetch([
      { intent: 'transaction', amount: 25000, category: 'Кафе', type: 'expense', description: 'кофе' },
      { intent: 'debt', debtType: 'i_owe', personName: 'Азиз', amount: 300000 },
    ]);
    const service = new OpenAITranscriptionService('test-api-key', { fetch: fetch as never });

    const result = await service.analyzeInput('кофе 25к и занял 300к у Азиза', { today: '2026-10-25' });

    expect(requests[0].messages[0].content).toContain('Сегодня 2026-10-25, воскресенье');
    expect(result.transactions.map(transaction => transaction.date)).toEqual(['2026-10-25', '2026-10-25']);
  });
});
