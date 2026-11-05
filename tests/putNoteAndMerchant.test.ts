import express from 'express';
import { createTransactionRouter } from '../src/modules/transaction/presentation/controllers/transactionController';
import { errorHandler } from '../src/delivery/web/express/middleware/errorMiddleware';
import { UpdateTransactionUseCase } from '../src/modules/transaction/application/updateTransaction';
import { UpdateTransactionWithLearningUseCase } from '../src/modules/transaction/application/updateTransactionWithLearning';
import { GetTransactionByIdUseCase } from '../src/modules/transaction/application/getTransactionById';
import { transactionLearning } from '../src/shared/application/learning/transactionLearning';
import { UserModule } from '../src/modules/user/userModule';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';
import { listenOnLoopback, LoopbackServer } from './helpers/testServer';

/**
 * #210: `PUT /api/transactions/:id` checks the note and the merchant as `POST` does (FT-113) — the same on the regular
 * update and on the learning one. A note or a merchant that is not text is `400`, a note longer than `POST`'s 500 is
 * `400`; text is trimmed, and `null`, empty or blank is none. The search text follows what is written.
 */
const TELEGRAM_ID = '131210000';
const USER = 'owner-uuid-210';
const users = {
  getGetOrCreateUserUseCase: () => ({ execute: jest.fn().mockResolvedValue({ id: USER }) }),
  getGetUserUseCase: () => ({ execute: jest.fn().mockResolvedValue({ success: true, data: { id: USER } }) }),
} as unknown as UserModule;
const unused = { execute: jest.fn() } as never;

/** A moment long before the test: a write moves `updatedAt` off it, SQLite counts in whole seconds. */
const BEFORE = '2026-10-30 08:00:00';

/** A body with a non-empty userId, originalText and originalParsing — all three — takes the learning update. */
const LEARNING_CONTEXT = {
  userId: USER,
  originalText: 'капучино bon 25000',
  originalParsing: { amount: 25000, category: 'Кафе', type: 'expense', merchant: 'Bon' },
};

const NOT_TEXT: Array<[string, unknown]> = [
  ['an object', { a: 1 }],
  ['a number', 123],
  ['a boolean', true],
  ['a list', ['кофе']],
];

describe('PUT checks the note and the merchant as POST does (#210)', () => {
  let db: TestDatabase;
  let records: ReturnType<typeof recordsOn>;
  let api: LoopbackServer;

  beforeEach(async () => {
    db = await openMigratedDatabase();
    records = recordsOn(db.dataSource);
    const app = express();
    app.use(express.json());
    app.use('/api/transactions', createTransactionRouter(
      unused, unused, unused,
      new GetTransactionByIdUseCase(records.repository),
      unused,
      new UpdateTransactionUseCase(records.repository, records.catalog, records.book),
      new UpdateTransactionWithLearningUseCase(records.repository, records.catalog, records.book),
      undefined,
      users
    ));
    app.use(errorHandler);
    api = await listenOnLoopback(app);
    jest.spyOn(transactionLearning, 'recordCorrection').mockResolvedValue();
  });

  afterEach(async () => {
    await api.close();
    await db.close();
    jest.restoreAllMocks();
  });

  /** The stored row as SQLite has it, every column. */
  const rowOf = async (id: string): Promise<Record<string, unknown>> =>
    (await db.dataSource.query('SELECT * FROM transactions WHERE id = ?', [id]))[0];

  /** «Кафе», 25 000 сум on 30 October with the note and merchant given; `updatedAt` moved back so a write shows. */
  async function record(description: string, merchant?: string): Promise<string> {
    const created = await records.create.execute({
      userId: USER, amount: 25000, type: 'expense', category: 'Кафе', description, merchant, date: '2026-10-30',
    } as never);
    if (!created.success) throw created.error;
    await db.dataSource.query('UPDATE transactions SET updatedAt = ? WHERE id = ?', [BEFORE, created.data]);
    return created.data;
  }

  async function put(id: string, body: Record<string, unknown>): Promise<{ status: number; body: any }> {
    const response = await fetch(`${api.baseUrl}/api/transactions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Dev-User-Id': TELEGRAM_ID },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }

  describe.each<[string, Record<string, unknown>]>([
    ['the regular update', {}],
    ['the learning update', LEARNING_CONTEXT],
  ])('%s', (_name, context) => {
    describe('the note', () => {
      it.each(NOT_TEXT)('%s is 400 VALIDATION_ERROR, as in POST; nothing is written', async (_kind, description) => {
        const id = await record('кофе');
        const before = await rowOf(id);

        const answer = await put(id, { ...context, description });

        expect(answer.status).toBe(400);
        expect(answer.body.error).toMatchObject({ code: 'VALIDATION_ERROR', message: 'description must be a string' });
        expect(await rowOf(id)).toEqual(before);
      });

      it('longer than POST\'s 500 characters is 400; 500 is written', async () => {
        const id = await record('кофе');
        const before = await rowOf(id);

        const tooLong = await put(id, { ...context, description: 'к'.repeat(501) });

        expect(tooLong.status).toBe(400);
        expect(tooLong.body.error).toMatchObject({
          code: 'VALIDATION_ERROR', message: 'description must be no more than 500 characters',
        });
        expect(await rowOf(id)).toEqual(before);

        expect((await put(id, { ...context, description: 'к'.repeat(500) })).status).toBe(200);
        expect((await rowOf(id)).description).toBe('к'.repeat(500));
      });

      it('is trimmed, and the search text follows it', async () => {
        const id = await record('кофе', 'Bon');

        const answer = await put(id, { ...context, description: '  капучино \n' });

        expect(answer.status).toBe(200);
        expect(answer.body.data).toMatchObject({ description: 'капучино', merchant: 'Bon' });
        const row = await rowOf(id);
        expect(row.description).toBe('капучино');
        expect(row.search_text).toBe('капучино bon');
      });

      it('only spaces is an empty note, as in POST', async () => {
        const id = await record('кофе', 'Bon');

        const answer = await put(id, { ...context, description: '   ' });

        expect(answer.status).toBe(200);
        expect(answer.body.data).toMatchObject({ description: '' });
        expect(await rowOf(id)).toMatchObject({ description: '', search_text: 'bon' });
      });

      it('the same note with spaces round it changes nothing (FT-248)', async () => {
        const id = await record('кофе');
        const before = await rowOf(id);

        const answer = await put(id, { ...context, description: ' кофе ' });

        expect(answer.status).toBe(200);
        expect(await rowOf(id)).toEqual(before);
      });
    });

    describe('the merchant', () => {
      it('a new merchant is written trimmed, and the search text follows it', async () => {
        const id = await record('капучино', 'Bon');

        const answer = await put(id, { ...context, merchant: '  Korzinka ' });

        expect(answer.status).toBe(200);
        expect(answer.body.data).toMatchObject({ description: 'капучино', merchant: 'Korzinka' });
        const row = await rowOf(id);
        expect(row.merchant).toBe('Korzinka');
        expect(row.search_text).toBe('капучино korzinka');
        expect(row.updatedAt).not.toBe(BEFORE);
      });

      it.each<[string, unknown]>([
        ['null', null],
        ['an empty string', ''],
        ['only spaces', '   '],
      ])('%s clears it: NULL, as on a record written without one; the search text keeps the note', async (_kind, merchant) => {
        const id = await record('капучино', 'Bon');

        const answer = await put(id, { ...context, merchant });

        expect(answer.status).toBe(200);
        expect(answer.body.data.merchant ?? undefined).toBeUndefined();
        const row = await rowOf(id);
        expect(row.merchant).toBeNull();
        expect(row.search_text).toBe('капучино');
      });

      it('a record without a merchant: null changes nothing (FT-248)', async () => {
        const id = await record('кофе');
        const before = await rowOf(id);

        const answer = await put(id, { ...context, merchant: null });

        expect(answer.status).toBe(200);
        expect(await rowOf(id)).toEqual(before);
      });

      it('the same merchant with spaces round it changes nothing (FT-248)', async () => {
        const id = await record('кофе', 'Bon');
        const before = await rowOf(id);

        const answer = await put(id, { ...context, merchant: ' Bon ' });

        expect(answer.status).toBe(200);
        expect(await rowOf(id)).toEqual(before);
      });

      it.each(NOT_TEXT)('%s is 400 VALIDATION_ERROR, as in POST; nothing is written', async (_kind, merchant) => {
        const id = await record('кофе', 'Bon');
        const before = await rowOf(id);

        const answer = await put(id, { ...context, merchant });

        expect(answer.status).toBe(400);
        expect(answer.body.error).toMatchObject({ code: 'VALIDATION_ERROR', message: 'merchant must be a string' });
        expect(await rowOf(id)).toEqual(before);
      });
    });
  });

  describe('the learning update', () => {
    it('learns the trimmed merchant', async () => {
      const id = await record('капучино', 'Bon');

      expect((await put(id, { ...LEARNING_CONTEXT, merchant: ' Korzinka ' })).status).toBe(200);

      expect(transactionLearning.recordCorrection).toHaveBeenCalledWith(
        LEARNING_CONTEXT.originalText, LEARNING_CONTEXT.originalParsing, { merchant: 'Korzinka' }, USER, 0.8
      );
    });

    it('a cleared merchant teaches nothing: there is no name to learn', async () => {
      const id = await record('капучино', 'Bon');

      expect((await put(id, { ...LEARNING_CONTEXT, merchant: null })).status).toBe(200);

      expect(transactionLearning.recordCorrection).not.toHaveBeenCalled();
    });
  });
});
