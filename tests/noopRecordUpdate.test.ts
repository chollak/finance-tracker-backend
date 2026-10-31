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
 * FT-248: the capture quality report (FT-217) counts a record as edited when its `updatedAt` is later than its
 * `createdAt` — the database keeps no history of edits. A `PUT /api/transactions/:id` in which no field changes value
 * (the Mini App confirming a «?» category with the same one) must therefore write nothing: the row and its `updatedAt`
 * stay as they were, and the answer is the one it was — 200 with the record.
 */
const TELEGRAM_ID = '131248000';
const USER = 'owner-uuid-ft248';
const users = {
  getGetOrCreateUserUseCase: () => ({ execute: jest.fn().mockResolvedValue({ id: USER }) }),
  getGetUserUseCase: () => ({ execute: jest.fn().mockResolvedValue({ success: true, data: { id: USER } }) }),
} as unknown as UserModule;
const unused = { execute: jest.fn() } as never;

/** A moment long before the test: a write moves `updatedAt` off it, SQLite counts in whole seconds. */
const BEFORE = '2026-10-30 08:00:00';

describe('a PUT that changes nothing writes nothing (FT-248)', () => {
  let db: TestDatabase;
  let records: ReturnType<typeof recordsOn>;
  let api: LoopbackServer;

  beforeEach(async () => {
    db = await openMigratedDatabase();
    records = recordsOn(db.dataSource);
    const app = express();
    app.use(express.json());
    app.use('/api/transactions', createTransactionRouter(
      unused, unused, unused, unused,
      new GetTransactionByIdUseCase(records.repository),
      unused,
      new UpdateTransactionUseCase(records.repository, records.catalog, records.book),
      new UpdateTransactionWithLearningUseCase(records.repository, records.catalog, records.book),
      unused, unused, unused, unused, unused,
      undefined,
      users
    ));
    app.use(errorHandler);
    api = await listenOnLoopback(app);
  });

  afterEach(async () => {
    await api.close();
    await db.close();
    jest.restoreAllMocks();
  });

  const categoryId = async (name: string) =>
    (await records.catalog.listForUser(USER)).find(category => category.name === name && category.type === 'expense')!.id;

  const accountId = async () => (await records.book.listForUser(USER))[0].id;

  /** The stored row as SQLite has it, every column. */
  const rowOf = async (id: string): Promise<Record<string, unknown>> =>
    (await db.dataSource.query('SELECT * FROM transactions WHERE id = ?', [id]))[0];

  /** «Кафе», 25 000 сум, «кофе», 30 October, flagged for review, as the AI writes a record it was unsure of. */
  async function recordOf(overrides: Record<string, unknown> = {}): Promise<string> {
    const created = await records.create.execute({
      userId: USER, amount: 25000, type: 'expense', category: 'Кафе', description: 'кофе', date: '2026-10-30',
      needsReview: true, ...overrides,
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

  /** The record as the API shows it: what a write would answer. */
  const shownRecord = async (id: string) => JSON.parse(JSON.stringify(await records.repository.findById(id)));

  describe('every field sent as stored: 200 with the record, the row and its updatedAt untouched', () => {
    it.each<[string, () => Promise<Record<string, unknown>>]>([
      ['the same categoryId — «?» confirmed in the Mini App', async () => ({ categoryId: await categoryId('Кафе') })],
      ['the category by its name', async () => ({ category: 'Кафе' })],
      ['the category by its name in another case', async () => ({ category: 'кафе' })],
      ['the same amount in сум', async () => ({ amount: 25000 })],
      ['the same amount as text', async () => ({ amount: '25 000' })],
      ['the same amount in minor units', async () => ({ amountMinor: 2_500_000 })],
      ['the same amount both ways', async () => ({ amount: 25000, amountMinor: 2_500_000 })],
      ['the same day', async () => ({ date: '2026-10-30' })],
      ['the same account', async () => ({ accountId: await accountId() })],
      ['the same account and currency', async () => ({ accountId: await accountId(), currency: 'UZS' })],
      ['the same currency alone', async () => ({ currency: 'UZS' })],
      ['the same note', async () => ({ description: 'кофе' })],
      ['the same type', async () => ({ type: 'expense' })],
      ['the same meaning', async () => ({ semanticType: 'expense' })],
      ['«Нужно проверить» as it is', async () => ({ needsReview: true })],
      ['the same amount and day, as the record sheet would', async () => ({ amountMinor: 2_500_000, date: '2026-10-30' })],
      ['every field at once', async () => ({
        amount: 25000, categoryId: await categoryId('Кафе'), accountId: await accountId(), currency: 'UZS',
        description: 'кофе', date: '2026-10-30', type: 'expense', semanticType: 'expense', needsReview: true,
      })],
    ])('%s', async (_name, body) => {
      const id = await recordOf();
      const before = await rowOf(id);

      const answer = await put(id, await body());

      expect(answer.status).toBe(200);
      expect(answer.body.data).toEqual(await shownRecord(id));
      expect(answer.body.data).toMatchObject({ id, category: 'Кафе', amountMinor: 2_500_000, description: 'кофе' });
      expect(await rowOf(id)).toEqual(before);
      expect((await rowOf(id)).updatedAt).toBe(BEFORE);
    });

    it('an old category id that resolves to the record’s category changes nothing', async () => {
      const id = await recordOf({ category: 'Другое' });
      const before = await rowOf(id);
      // An unknown old value lands in «Другое», where the record already is
      const resolved = await records.catalog.resolveForRecord({ userId: USER, type: 'expense', category: 'no-such-old-id' });
      expect(resolved.success && resolved.data.id).toBe(await categoryId('Другое'));

      expect((await put(id, { category: 'no-such-old-id' })).status).toBe(200);
      expect(await rowOf(id)).toEqual(before);
    });

    it('no note sent as an empty note on a record without one', async () => {
      const id = await recordOf({ description: '' });
      const before = await rowOf(id);

      expect((await put(id, { description: '' })).status).toBe(200);
      expect(await rowOf(id)).toEqual(before);
    });
  });

  describe('a change is written as before', () => {
    it('one field the same, another new: both sent, the new one written and updatedAt moves', async () => {
      const id = await recordOf();

      const answer = await put(id, { categoryId: await categoryId('Кафе'), description: 'капучино' });

      expect(answer.status).toBe(200);
      expect(answer.body.data).toMatchObject({ category: 'Кафе', description: 'капучино' });
      expect((await rowOf(id)).updatedAt).not.toBe(BEFORE);
    });

    it('the same amount on another day', async () => {
      const id = await recordOf();

      expect((await put(id, { amountMinor: 2_500_000, date: '2026-10-29' })).body.data).toMatchObject({ date: '2026-10-29' });
      expect((await rowOf(id)).updatedAt).not.toBe(BEFORE);
    });

    it('another category', async () => {
      const id = await recordOf();

      expect((await put(id, { categoryId: await categoryId('Продукты') })).body.data).toMatchObject({ category: 'Продукты' });
      expect((await rowOf(id)).updatedAt).not.toBe(BEFORE);
    });

    it('«Нужно проверить» taken off a flagged record: a real change', async () => {
      const id = await recordOf();

      expect((await put(id, { needsReview: false })).body.data).toMatchObject({ needsReview: false });
      expect((await rowOf(id)).updatedAt).not.toBe(BEFORE);
    });

    it('a day stored as a moment (before FT-100) is written as the day sent, even the same UTC day', async () => {
      const id = await recordOf();
      await db.dataSource.query('UPDATE transactions SET date = ? WHERE id = ?', ['2026-10-29T20:30:00.000Z', id]);

      expect((await put(id, { date: '2026-10-29' })).body.data).toMatchObject({ date: '2026-10-29' });
      expect((await rowOf(id)).updatedAt).not.toBe(BEFORE);
    });
  });

  describe('the learning update (a body with originalText and originalParsing)', () => {
    const context = {
      userId: USER,
      originalText: 'кофе 25000',
      originalParsing: { amount: 25000, category: 'Кафе', type: 'expense' },
    };

    it('nothing changed: the row stays and no correction is recorded', async () => {
      const recordCorrection = jest.spyOn(transactionLearning, 'recordCorrection').mockResolvedValue();
      const id = await recordOf({ merchant: 'Bon' });
      const before = await rowOf(id);

      const answer = await put(id, {
        ...context, categoryId: await categoryId('Кафе'), amount: 25000, merchant: 'Bon', semanticType: 'expense', needsReview: true,
      });

      expect(answer.status).toBe(200);
      expect(answer.body.data).toEqual(await shownRecord(id));
      expect(await rowOf(id)).toEqual(before);
      expect(recordCorrection).not.toHaveBeenCalled();
    });

    it.each<[string, Record<string, unknown>, Record<string, unknown>]>([
      ['a new merchant', { merchant: 'Korzinka' }, { merchant: 'Korzinka' }],
      ['another meaning', { semanticType: 'own_transfer' }, { semanticType: 'own_transfer' }],
      ['«Нужно проверить» taken off', { needsReview: false }, { needsReview: false }],
    ])('%s next to the same category is written', async (_name, change, written) => {
      jest.spyOn(transactionLearning, 'recordCorrection').mockResolvedValue();
      const id = await recordOf({ merchant: 'Bon' });

      const answer = await put(id, { ...context, categoryId: await categoryId('Кафе'), ...change });

      expect(answer.body.data).toMatchObject(written);
      expect((await rowOf(id)).updatedAt).not.toBe(BEFORE);
    });
  });
});
