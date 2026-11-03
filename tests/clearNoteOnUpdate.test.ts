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
 * FT-249: `PUT /api/transactions/:id { description: null }` is an empty note, as in `POST` (FT-113). The column
 * `transactions.description` is NOT NULL, so a null that reached the repository failed the write with 422.
 */
const TELEGRAM_ID = '131249000';
const USER = 'owner-uuid-ft249';
const users = {
  getGetOrCreateUserUseCase: () => ({ execute: jest.fn().mockResolvedValue({ id: USER }) }),
  getGetUserUseCase: () => ({ execute: jest.fn().mockResolvedValue({ success: true, data: { id: USER } }) }),
} as unknown as UserModule;
const unused = { execute: jest.fn() } as never;

/** A moment long before the test: a write moves `updatedAt` off it, SQLite counts in whole seconds. */
const BEFORE = '2026-10-30 08:00:00';

/** A body with originalText and originalParsing takes the learning update. */
const LEARNING_CONTEXT = {
  userId: USER,
  originalText: 'кофе 25000',
  originalParsing: { amount: 25000, category: 'Кафе', type: 'expense' },
};

describe('PUT { description: null } is an empty note (FT-249)', () => {
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

  /** «Кафе», 25 000 сум on 30 October with the note given; `updatedAt` moved back so a write shows. */
  async function recordWithNote(description: string, merchant?: string): Promise<string> {
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
    it('a record with a note: the note is cleared, 200', async () => {
      const id = await recordWithNote('кофе');

      const answer = await put(id, { ...context, description: null });

      expect(answer.status).toBe(200);
      expect(answer.body.data).toMatchObject({ id, description: '', category: 'Кафе', amountMinor: 2_500_000 });
      const row = await rowOf(id);
      expect(row.description).toBe('');
      expect(row.updatedAt).not.toBe(BEFORE);
    });

    it('the search text follows the cleared note and keeps the merchant', async () => {
      const id = await recordWithNote('капучино', 'Bon');

      expect((await put(id, { ...context, description: null })).status).toBe(200);

      const searchText = String((await rowOf(id)).search_text);
      expect(searchText).not.toContain('капучино');
      expect(searchText).toContain('bon');
    });

    it('a record without a note: nothing is written, 200', async () => {
      const id = await recordWithNote('');
      const before = await rowOf(id);

      const answer = await put(id, { ...context, description: null });

      expect(answer.status).toBe(200);
      expect(answer.body.data).toMatchObject({ id, description: '' });
      expect(await rowOf(id)).toEqual(before);
    });

    it('a null note next to a real change: both written', async () => {
      const id = await recordWithNote('кофе');

      const answer = await put(id, { ...context, description: null, date: '2026-10-29' });

      expect(answer.status).toBe(200);
      expect(answer.body.data).toMatchObject({ description: '', date: '2026-10-29' });
      expect(await rowOf(id)).toMatchObject({ description: '', date: '2026-10-29' });
    });
  });
});
