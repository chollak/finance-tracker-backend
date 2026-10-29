import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { QuickCaptureService } from '../src/modules/quickCapture/application/quickCaptureService';
import { QuickCaptureRequest } from '../src/modules/quickCapture/domain/quickCaptureTypes';
import { todayDateOnly } from '../src/shared/domain/dates/dateOnly';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';

/**
 * FT-175: a phrase from the phone's queue arrives hours or days after it was typed. With `capturedAt` it is dated by
 * the day it was typed — on the fast paths and by the AI — and a repeat answers with the first records whatever its time.
 */
const CLIENT_ID = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b';
// The server's clock: Thursday 2026-10-29, 17:00 in Tashkent
const NOW = new Date('2026-10-29T12:00:00.000Z');
// Typed on Tuesday morning in Tashkent
const TUESDAY = new Date('2026-10-27T09:15:00+05:00');

describe('quick capture keeps the time of input (FT-175)', () => {
  let db: TestDatabase;
  let openAI: { analyzeInput: jest.Mock };
  let service: QuickCaptureService;
  let serviceAt: (now: Date) => QuickCaptureService;

  beforeEach(async () => {
    db = await openMigratedDatabase();
    const records = recordsOn(db.dataSource);
    openAI = { analyzeInput: jest.fn() };
    const pipeline = new ProcessTextInputUseCase(openAI as unknown as TranscriptionService, records.create, undefined, records.catalog);
    serviceAt = now => new QuickCaptureService(pipeline, records.repository, () => now);
    service = serviceAt(NOW);
  });

  afterEach(async () => {
    await db.close();
  });

  const capture = (text: string, extra: Partial<QuickCaptureRequest> = {}) => service.capture({ text, userId: 'user-1', ...extra });
  const storedDates = async () =>
    (await db.dataSource.query('SELECT date FROM transactions ORDER BY rowid')).map((row: { date: string }) => row.date);

  describe('the fast path', () => {
    it('writes a phrase without a day on the day it was typed', async () => {
      const result = await capture('кофе 25000', { capturedAt: TUESDAY });

      expect(result.transactions[0].date).toBe('2026-10-27');
      expect(result.ack.details).not.toBe('Сегодня');
      expect(await storedDates()).toEqual(['2026-10-27']);
      expect(openAI.analyzeInput).not.toHaveBeenCalled();
    });

    it('writes «вчера такси» on the day before it was typed', async () => {
      const result = await capture('вчера такси 18000', { capturedAt: TUESDAY });

      expect(result.transactions[0]).toMatchObject({ date: '2026-10-26', category: 'Транспорт', description: 'такси' });
      expect(openAI.analyzeInput).not.toHaveBeenCalled();
    });
  });

  describe('the AI', () => {
    it('counts from the day it was typed and dates a record by it', async () => {
      openAI.analyzeInput.mockImplementation(async (_text: string, context: { today?: string }) => ({
        transactions: [
          { intent: 'transaction', amount: 25000, category: 'Кафе', type: 'expense', date: context.today, description: 'кофе' },
          { intent: 'transaction', amount: 18000, category: 'Транспорт', type: 'expense', date: '2026-10-26', description: 'такси' },
        ],
        debts: [],
      }));

      const result = await capture('кофе 25000 и вчера такси 18000', { capturedAt: TUESDAY });

      expect(openAI.analyzeInput).toHaveBeenCalledWith('кофе 25000 и вчера такси 18000', expect.objectContaining({ today: '2026-10-27' }));
      expect(result.transactions.map(transaction => transaction.date)).toEqual(['2026-10-27', '2026-10-26']);
      expect(await storedDates()).toEqual(['2026-10-27', '2026-10-26']);
    });
  });

  it('without capturedAt dates by the server\'s today, as before', async () => {
    await capture('кофе 25000');

    expect(await storedDates()).toEqual([todayDateOnly()]);
  });

  it('refuses a time of input older than 30 days and writes nothing', async () => {
    const capturedAt = new Date('2026-09-29T11:59:59.000Z');

    const refused = await capture('кофе 25000', { capturedAt, clientId: CLIENT_ID }).catch((error: unknown) => error);

    expect(refused).toMatchObject({ code: 'VALIDATION_ERROR', field: 'capturedAt', message: 'capturedAt is older than 30 days' });
    expect(await storedDates()).toEqual([]);
    expect(openAI.analyzeInput).not.toHaveBeenCalled();
  });

  it('dates a time of input ahead of the server by the server\'s clock: it was not typed after it arrived', async () => {
    // Typed at 00:10 on Friday by the phone; the server (WSL after a sleep) still says Thursday 17:00
    const result = await capture('вчера такси 18000', { capturedAt: new Date('2026-10-30T00:10:00+05:00') });

    expect(result.transactions[0].date).toBe('2026-10-28');
    expect(await storedDates()).toEqual(['2026-10-28']);
  });

  it('trusts a phone up to 5 minutes ahead of the server', async () => {
    // 00:03 on Friday by the phone, 23:59 on Thursday by the server
    service = serviceAt(new Date('2026-10-29T18:59:00.000Z'));

    await capture('кофе 25000', { capturedAt: new Date('2026-10-30T00:03:00+05:00') });

    expect(await storedDates()).toEqual(['2026-10-30']);
  });

  it.each([
    ['another time', new Date('2026-10-28T20:00:00+05:00')],
    ['a time ahead of the server', new Date('2026-10-30T12:00:00.000Z')],
    ['a time older than 30 days', new Date('2026-08-01T12:00:00.000Z')],
    ['no time', undefined],
  ])('answers a repeat of the same clientId with %s by the first records', async (_why, capturedAt) => {
    const first = await capture('вчера такси 18000', { capturedAt: TUESDAY, clientId: CLIENT_ID });

    const repeat = await capture('вчера такси 18000', { clientId: CLIENT_ID, ...(capturedAt ? { capturedAt } : {}) });

    expect(repeat.repeated).toBe(true);
    expect(repeat.transactions.map(transaction => [transaction.id, transaction.date])).toEqual([[first.transactions[0].id, '2026-10-26']]);
    expect(await storedDates()).toEqual(['2026-10-26']);
  });
});
