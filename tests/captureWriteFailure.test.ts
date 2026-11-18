import express from 'express';
import http from 'http';
import fs from 'fs/promises';
import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { ProcessVoiceInputUseCase } from '../src/modules/voiceProcessing/application/processVoiceInput';
import { CaptureNotSavedError } from '../src/modules/voiceProcessing/domain/voiceErrors';
import { ParsedTransaction, TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { QuickCaptureService } from '../src/modules/quickCapture/application/quickCaptureService';
import { createQuickCaptureRouter } from '../src/modules/quickCapture/presentation/controllers/quickCaptureController';
import { fieldsForUpdate } from '../src/modules/transaction/application/fieldsForUpdate';
import { errorHandler } from '../src/delivery/web/express/middleware/errorMiddleware';
import { StorageError } from '../src/shared/domain/errors/AppError';
import { MAX_NOTE_LENGTH } from '../src/shared/application/validation/validators';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';
import { listenOnLoopback } from './helpers/testServer';

// ffmpeg is faked: a real one on fake audio is one more process per voice test (#295)
jest.mock('child_process', () => jest.requireActual('./helpers/fakeFfmpeg').childProcessWithFakeFfmpeg());

/**
 * #299: a record that could not be written is an error the client sends again, not «не нашёл операцию» — and a phrase
 * of several records is written whole or not at all. A record refused for what it says (an amount over the limit) is
 * not a failure: it is named with the reason, the rest of the phrase is written.
 */

const CLIENT_ID = '0b7e1c52-9a3d-4e7f-8c21-5d6f7a8b9c0d';
const taxi: ParsedTransaction = { intent: 'transaction', amount: 18000, category: 'Транспорт', type: 'expense', date: '2026-11-18', description: 'такси' };
const coffee: ParsedTransaction = { intent: 'transaction', amount: 25000, category: 'Кафе', type: 'expense', date: '2026-11-18', description: 'кофе' };
const car: ParsedTransaction = { intent: 'transaction', amount: 1_200_000_000, category: 'Транспорт', type: 'expense', date: '2026-11-18', description: 'машина' };

describe('a record that could not be written (#299)', () => {
  let db: TestDatabase;
  let records: ReturnType<typeof recordsOn>;
  let openAI: { analyzeInput: jest.Mock; transcribe: jest.Mock };
  let pipeline: ProcessTextInputUseCase;
  let service: QuickCaptureService;

  beforeEach(async () => {
    db = await openMigratedDatabase();
    records = recordsOn(db.dataSource);
    openAI = { analyzeInput: jest.fn(), transcribe: jest.fn() };
    pipeline = new ProcessTextInputUseCase(openAI as unknown as TranscriptionService, records.create, undefined, records.catalog);
    service = new QuickCaptureService(pipeline, records.repository);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await db.close();
  });

  const reads = (...transactions: ParsedTransaction[]) => openAI.analyzeInput.mockResolvedValue({ transactions, debts: [] });
  const clientIds = async (): Promise<string[]> =>
    (await db.dataSource.query('SELECT client_id FROM transactions ORDER BY client_id')).map((row: { client_id: string }) => row.client_id);
  /** The database refuses the write of the record number `failing` (from 1), once. */
  function failWrite(failing: number): void {
    const create = records.repository.create.bind(records.repository);
    let call = 0;
    jest.spyOn(records.repository, 'create').mockImplementation(async transaction => {
      call += 1;
      if (call === failing) throw new Error('SQLITE_BUSY: database is locked');
      return create(transaction);
    });
  }

  describe('a phrase of two records whose second write fails', () => {
    const request = { text: 'такси 18к и кофе 25к', userId: 'user-1', clientId: CLIENT_ID };

    it('writes nothing and is an error, not «no_transaction»', async () => {
      reads(taxi, coffee);
      failWrite(2);

      const failed = await service.capture(request).catch(error => error);

      expect(failed).toBeInstanceOf(CaptureNotSavedError);
      expect(failed).toBeInstanceOf(StorageError);
      expect(failed.message).not.toMatch(/SQLITE|locked/);
      expect(await clientIds()).toEqual([]);
    });

    it('sent again with the same clientId writes both, once; a third time is a repeat', async () => {
      reads(taxi, coffee);
      failWrite(2);
      await expect(service.capture(request)).rejects.toBeInstanceOf(CaptureNotSavedError);

      const again = await service.capture(request);

      expect(again.repeated).toBeUndefined();
      expect(again.status).toBe('saved');
      expect(again.transactions.map(record => record.amount)).toEqual([18000, 25000]);
      expect(await clientIds()).toEqual([CLIENT_ID, `${CLIENT_ID}:1`]);

      const third = await service.capture(request);
      expect(third.repeated).toBe(true);
      expect(third.transactions.map(record => record.id)).toEqual(again.transactions.map(record => record.id));
      expect(await clientIds()).toEqual([CLIENT_ID, `${CLIENT_ID}:1`]);
    });

    it('gives the free limit back the record it took back', async () => {
      const counted: string[] = [];
      const counter = (direction: string) => ({ execute: async () => { counted.push(direction); } });
      records.create.setSubscriptionDependencies(
        { getIncrementUsageUseCase: () => counter('+'), getDecrementUsageUseCase: () => counter('-') } as never,
        { getGetOrCreateUserUseCase: () => ({ execute: jest.fn().mockResolvedValue({ id: 'uuid-1' }) }) } as never
      );
      reads(taxi, coffee);
      failWrite(2);

      await expect(service.capture({ ...request, userId: '131184740' })).rejects.toBeInstanceOf(CaptureNotSavedError);

      expect(counted).toEqual(['+', '-']);
    });

    it('a failure of the category or account lookup is the same error', async () => {
      reads(taxi, coffee);
      const resolve = records.book.resolveForRecord.bind(records.book);
      jest.spyOn(records.book, 'resolveForRecord')
        .mockImplementationOnce(resolve)
        .mockRejectedValueOnce(new Error('SQLITE_IOERR: disk I/O error'));

      await expect(service.capture(request)).rejects.toBeInstanceOf(CaptureNotSavedError);
      expect(await clientIds()).toEqual([]);
    });
  });

  it('a single record that fails is the error too — the old answer was an empty list', async () => {
    reads(coffee);
    failWrite(1);

    await expect(pipeline.execute('обедали с командой. Вышло 25к', 'user-1')).rejects.toBeInstanceOf(CaptureNotSavedError);
  });

  it('the answer to «Сколько?» that could not be written is the error, not «nothing written»', async () => {
    failWrite(1);

    await expect(service.captureWithAmount({
      item: { description: 'такси', category: 'Транспорт', type: 'expense', date: '2026-11-18' },
      answer: { text: '18к', amount: 18000, currency: 'UZS' },
      userId: 'user-1',
      source: 'telegram',
    })).rejects.toBeInstanceOf(CaptureNotSavedError);
  });

  it('a voice message fails the same way', async () => {
    jest.spyOn(fs, 'access').mockResolvedValue(undefined);
    jest.spyOn(fs, 'rename').mockResolvedValue(undefined);
    jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);
    openAI.transcribe.mockResolvedValue('такси восемнадцать тысяч и кофе двадцать пять');
    reads(taxi, coffee);
    failWrite(2);
    const voice = new ProcessVoiceInputUseCase(openAI as unknown as TranscriptionService, records.create, undefined, records.catalog);

    await expect(voice.execute({ filePath: '/nowhere/voice.ogg', userId: 'user-1', source: 'telegram', clientId: CLIENT_ID }))
      .rejects.toBeInstanceOf(CaptureNotSavedError);
    expect(await clientIds()).toEqual([]);
  });

  describe('a record refused for what it says', () => {
    it('is not written and is named with the reason; the rest of the phrase is written', async () => {
      reads(coffee, car);

      const result = await service.capture({ text: 'кофе 25к и машина 1.2 млрд', userId: 'user-1', clientId: CLIENT_ID });

      expect(result.status).toBe('saved');
      expect(result.transactions.map(record => record.amount)).toEqual([25000]);
      expect(result.notWritten).toEqual([{ description: 'машина', reason: 'amount_too_large' }]);
      expect(result.ack.summary).toBe('Кофе · 25 000 сум · Кафе\nМашина — не записал: сумма больше 1 000 000 000');
      expect(await clientIds()).toEqual([CLIENT_ID]);
    });

    it('alone is «no_transaction» that says why, not an error to send again', async () => {
      reads(car);

      const result = await service.capture({ text: 'купил машину за 1.2 млрд', userId: 'user-1', clientId: CLIENT_ID });

      expect(result.status).toBe('no_transaction');
      expect(result.notWritten).toEqual([{ description: 'машина', reason: 'amount_too_large' }]);
      expect(result.ack).toEqual({ title: 'Не записал', summary: 'Машина — сумма больше 1 000 000 000', actions: [] });
      expect(await clientIds()).toEqual([]);
    });

    it('an amount that is not above zero has its own reason', async () => {
      reads({ ...coffee, amount: 0 });

      const result = await pipeline.execute('пили кофе, вышло бесплатно', 'user-1');

      expect(result.transactions).toEqual([]);
      expect(result.notWritten).toEqual([{ description: 'кофе', reason: 'amount_invalid' }]);
    });

    it('does not take back what was written before it', async () => {
      reads(taxi, car, coffee);

      const result = await pipeline.execute('такси 18к, машина 1.2 млрд и кофе 25к', 'user-1', undefined, { clientId: CLIENT_ID });

      expect(result.transactions.map(record => record.amount)).toEqual([18000, 25000]);
      // The refused item keeps its place in the phrase: a repeat names the same records
      expect(await clientIds()).toEqual([CLIENT_ID, `${CLIENT_ID}:2`]);
    });
  });

  describe('a note longer than a record takes', () => {
    it('is cut to the limit an edit has, so the record can be edited', async () => {
      const phrase = `вчера обедали с командой. ${'очень '.repeat(120)}вкусно, вышло 45000`;
      reads({ ...coffee, amount: 45000, description: '' });

      const result = await pipeline.execute(phrase, 'user-1');

      expect(phrase.length).toBeGreaterThan(MAX_NOTE_LENGTH);
      const [{ description }] = await db.dataSource.query('SELECT description FROM transactions');
      expect(description).toBe(phrase.substring(0, MAX_NOTE_LENGTH));
      expect(result.transactions[0].description).toBe(description);
      expect(fieldsForUpdate({ description }).success).toBe(true);
      expect(fieldsForUpdate({ description: `${description}!` }).success).toBe(false);
    });

    it('the AI’s own long note is cut the same way', async () => {
      reads({ ...coffee, description: 'к'.repeat(MAX_NOTE_LENGTH + 40) });

      await pipeline.execute('обедали с командой. Вышло 25к', 'user-1');

      const [{ description }] = await db.dataSource.query('SELECT description FROM transactions');
      expect(description).toHaveLength(MAX_NOTE_LENGTH);
    });
  });

  describe('POST /api/quick-capture', () => {
    let server: http.Server;
    let baseUrl: string;

    beforeEach(async () => {
      const app = express();
      app.use(express.json());
      app.use('/api/quick-capture', createQuickCaptureRouter(service, new UserModule(new SqliteUserRepository(db.dataSource))));
      app.use(errorHandler);
      ({ server, baseUrl } = await listenOnLoopback(app));
    });

    afterEach(done => {
      server.close(done);
    });

    // Signed in as Telegram user 131184740 through the local dev header
    const post = async (body: unknown) => {
      const res = await fetch(`${baseUrl}/api/quick-capture`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Dev-User-Id': '131184740' }, body: JSON.stringify(body),
      });
      return { status: res.status, body: await res.json() };
    };
    const body = { text: 'такси 18к и кофе 25к', userId: '131184740', source: 'ios_shortcut', clientId: CLIENT_ID };

    it('answers 500 INTERNAL_ERROR without the cause; the same clientId sent again answers 200 with both records', async () => {
      reads(taxi, coffee);
      failWrite(2);

      const failed = await post(body);

      expect(failed.status).toBe(500);
      expect(failed.body).toEqual({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'The capture was not saved, send it again', timestamp: expect.any(String) },
      });

      const again = await post(body);

      expect(again.status).toBe(200);
      expect(again.body.data).toMatchObject({ status: 'saved', transactions: [{ amount: 18000 }, { amount: 25000 }] });
      expect(again.body.data.repeated).toBeUndefined();
      expect(await clientIds()).toEqual([CLIENT_ID, `${CLIENT_ID}:1`]);
    });

    it('answers 200 for a record refused for what it says: nothing to send again', async () => {
      reads(car);

      const refused = await post({ ...body, text: 'купил машину за 1.2 млрд' });

      expect(refused.status).toBe(200);
      expect(refused.body.data).toMatchObject({
        status: 'no_transaction',
        transactions: [],
        notWritten: [{ description: 'машина', reason: 'amount_too_large' }],
        ack: { title: 'Не записал' },
      });
    });
  });
});
