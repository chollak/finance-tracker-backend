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
 * #229: `PUT /api/transactions/:id` checks its fields alike on the regular update and on the learning one (a body with
 * a non-empty `userId`, `originalText` and `originalParsing`, all three) — one check for both, so a `semanticType` or a `needsReview` of a wrong type
 * is `400` on the learning path too and never reaches the repository. And `POST` stores a blank merchant as `NULL`,
 * as `PUT` clears one (#210).
 */
const TELEGRAM_ID = '131229000';
const USER = 'owner-uuid-229';
const users = {
  getGetOrCreateUserUseCase: () => ({ execute: jest.fn().mockResolvedValue({ id: USER }) }),
  getGetUserUseCase: () => ({ execute: jest.fn().mockResolvedValue({ success: true, data: { id: USER } }) }),
} as unknown as UserModule;
const unused = { execute: jest.fn() } as never;

/** A second account of the user: records are put on it, so a move to the default «Карта» shows. */
const CASH = 'cash-account-229';

/** A body with a non-empty userId, originalText and originalParsing — all three — takes the learning update. */
const LEARNING_CONTEXT = {
  userId: USER,
  originalText: 'капучино bon 25000',
  originalParsing: { amount: 25000, category: 'Кафе', type: 'expense', merchant: 'Bon' },
};

/** A field of a wrong type or value, and the error the regular update has always answered with. */
const REFUSED: Array<[string, Record<string, unknown>, string]> = [
  ['semanticType not one of the types', { semanticType: 'crypto_trade' }, 'Invalid semanticType'],
  ['semanticType a number', { semanticType: 3 }, 'Invalid semanticType'],
  ['semanticType null', { semanticType: null }, 'Invalid semanticType'],
  ['needsReview a string', { needsReview: 'yes' }, 'needsReview must be a boolean'],
  ['needsReview a number', { needsReview: 1 }, 'needsReview must be a boolean'],
  ['needsReview null', { needsReview: null }, 'needsReview must be a boolean'],
  ['an amount below 0.01', { amountMinor: 0 }, 'Amount must be at least 0.01'],
  ['a date not YYYY-MM-DD', { date: '30.10.2026' }, 'Invalid date format. Use YYYY-MM-DD'],
  // Not text: a list passed the format check and was written as text of the list
  ['date a list', { date: ['2026-10-30'] }, 'date must be a string'],
  ['date a number', { date: 20261030 }, 'date must be a string'],
  ['date null', { date: null }, 'date must be a string'],
  ['a type other than income or expense', { type: 'transfer' }, 'Type must be "income" or "expense"'],
  ['a blank category', { category: '  ' }, 'Category cannot be empty'],
  // Not text: was a 500 from `.trim()` on both paths
  ['category a number', { category: 5 }, 'category must be a string'],
  ['category null', { category: null }, 'category must be a string'],
  ['category an object', { category: { name: 'Кафе' } }, 'category must be a string'],
  ['category a list', { category: ['Кафе'] }, 'category must be a string'],
  // Not a non-empty id: was a 404 from the resolver, and null or blank silently moved the record to «Другое»
  ['categoryId a number', { categoryId: 5 }, 'categoryId must be a string'],
  ['categoryId true', { categoryId: true }, 'categoryId must be a string'],
  ['categoryId an object', { categoryId: { id: 'cafe' } }, 'categoryId must be a string'],
  ['categoryId null', { categoryId: null }, 'categoryId must be a string'],
  ['categoryId an empty string', { categoryId: '' }, 'categoryId cannot be empty'],
  ['categoryId only spaces', { categoryId: '   ' }, 'categoryId cannot be empty'],
  // Not a non-empty id: null, '', 0 and false silently moved the record to the default account, others were a 404
  ['accountId null', { accountId: null }, 'accountId must be a string'],
  ['accountId an empty string', { accountId: '' }, 'accountId cannot be empty'],
  ['accountId only spaces', { accountId: '   ' }, 'accountId cannot be empty'],
  ['accountId 0', { accountId: 0 }, 'accountId must be a string'],
  ['accountId false', { accountId: false }, 'accountId must be a string'],
  ['accountId a number', { accountId: 5 }, 'accountId must be a string'],
  ['accountId an object', { accountId: { id: 'cash' } }, 'accountId must be a string'],
];

describe('record fields are checked alike (#229)', () => {
  let db: TestDatabase;
  let records: ReturnType<typeof recordsOn>;
  let api: LoopbackServer;

  beforeEach(async () => {
    db = await openMigratedDatabase();
    records = recordsOn(db.dataSource);
    const app = express();
    app.use(express.json());
    app.use('/api/transactions', createTransactionRouter(
      records.create, unused, unused,
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

  async function send(method: 'POST' | 'PUT', path: string, body: Record<string, unknown>) {
    const response = await fetch(`${api.baseUrl}/api/transactions${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Dev-User-Id': TELEGRAM_ID },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }

  describe.each<[string, Record<string, unknown>]>([
    ['the regular update', {}],
    ['the learning update', LEARNING_CONTEXT],
  ])('PUT, %s', (_name, context) => {
    /** «Кафе», 25 000 сум, «кофе» at Bon on 30 October, on «Наличные» — not the default account. */
    async function record(): Promise<string> {
      await records.book.listForUser(USER); // the starter «Карта» first: it stays the default
      await records.accountRepository.create({
        id: CASH, userId: USER, name: 'Наличные', kind: 'cash', currency: 'UZS', openingBalanceMinor: 0,
        openingDate: '2026-10-01', openingAt: null, isHidden: false, sortOrder: 20,
      });
      const created = await records.create.execute({
        userId: USER, amount: 25000, type: 'expense', category: 'Кафе', description: 'кофе', merchant: 'Bon',
        date: '2026-10-30', accountId: CASH,
      } as never);
      if (!created.success) throw created.error;
      return created.data;
    }

    it.each(REFUSED)('%s is 400 VALIDATION_ERROR; nothing is written', async (_kind, field, message) => {
      const id = await record();
      const before = await rowOf(id);

      const answer = await send('PUT', `/${id}`, { ...context, ...field });

      expect(answer.status).toBe(400);
      expect(answer.body.error).toMatchObject({ code: 'VALIDATION_ERROR', message });
      expect(await rowOf(id)).toEqual(before);
    });

    it('the record is on the second account, and an unknown account is still 404 NOT_FOUND', async () => {
      const id = await record();
      const before = await rowOf(id);
      expect(before.account_id ?? before.accountId).toBe(CASH);

      const answer = await send('PUT', `/${id}`, { ...context, accountId: 'no-such-account' });

      expect(answer.status).toBe(404);
      expect(answer.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Account not found: no-such-account' });
      expect(await rowOf(id)).toEqual(before);
    });

    it('a known semanticType and a boolean needsReview are written', async () => {
      const id = await record();

      const answer = await send('PUT', `/${id}`, { ...context, semanticType: 'group_payment', needsReview: true });

      expect(answer.status).toBe(200);
      expect(answer.body.data).toMatchObject({ semanticType: 'group_payment', needsReview: true });
      expect(await rowOf(id)).toMatchObject({ semanticType: 'group_payment', needsReview: 1 });
    });
  });

  describe('POST, the merchant', () => {
    const COFFEE = { amountMinor: 2500000, type: 'expense', category: 'Кафе', description: 'кофе', date: '2026-10-30' };

    it.each<[string, unknown]>([
      ['an empty string', ''],
      ['only spaces', '   '],
      ['spaces and a line break', ' \n '],
      ['null', null],
    ])('%s is stored as NULL, as a record written without one; the answer has no merchant', async (_kind, merchant) => {
      const answer = await send('POST', '', { ...COFFEE, merchant });

      expect(answer.status).toBe(201);
      expect(answer.body.data.transaction).not.toHaveProperty('merchant');
      const row = await rowOf(answer.body.data.id);
      expect(row.merchant).toBeNull();
      expect(row.search_text).toBe('кофе');
    });

    it('text is stored trimmed', async () => {
      const answer = await send('POST', '', { ...COFFEE, merchant: '  Bon ' });

      expect(answer.status).toBe(201);
      expect(answer.body.data.transaction).toMatchObject({ merchant: 'Bon' });
      expect(await rowOf(answer.body.data.id)).toMatchObject({ merchant: 'Bon', search_text: 'кофе bon' });
    });
  });
});
