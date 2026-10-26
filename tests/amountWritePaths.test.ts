import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { createTransactionRouter } from '../src/modules/transaction/presentation/controllers/transactionController';
import { errorHandler } from '../src/delivery/web/express/middleware/errorMiddleware';
import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';
import { UpdateTransactionUseCase } from '../src/modules/transaction/application/updateTransaction';
import { UpdateTransactionWithLearningUseCase } from '../src/modules/transaction/application/updateTransactionWithLearning';
import { GetTransactionByIdUseCase } from '../src/modules/transaction/application/getTransactionById';
import { CreateDebtUseCase } from '../src/modules/debt/application/createDebt';
import { DebtRepository } from '../src/modules/debt/domain/debtRepository';
import { DebtType } from '../src/modules/debt/domain/debtEntity';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';
import { TransactionRepository } from '../src/modules/transaction/domain/transactionRepository';
import { fromMinor, toMinor } from '../src/shared/domain/money/money';
import { transactionLearning } from '../src/shared/application/learning/transactionLearning';
import { UserModule } from '../src/modules/user/userModule';

jest.mock('../src/shared/application/learning/transactionLearning', () => ({
  transactionLearning: { recordCorrection: jest.fn().mockResolvedValue(undefined) },
}));

/** Stores what a writer asked for, the way SqliteTransactionRepository does: minor units only. */
class MemoryTransactions implements Partial<TransactionRepository> {
  rows = new Map<string, Transaction>();
  private next = 1;

  async create(transaction: Transaction): Promise<Transaction> {
    const id = `tx-${this.next++}`;
    const amountMinor = transaction.amountMinor ?? toMinor(transaction.amount);
    const stored = { ...transaction, id, amountMinor, amount: fromMinor(amountMinor) };
    this.rows.set(id, stored);
    return stored;
  }

  async findById(id: string): Promise<Transaction | null> {
    return this.rows.get(id) ?? null;
  }

  async findByIdIncludingArchived(id: string): Promise<Transaction | null> {
    return this.rows.get(id) ?? null;
  }

  async update(id: string, updates: Partial<Transaction>): Promise<Transaction> {
    const current = this.rows.get(id)!;
    const amountMinor = updates.amountMinor ?? current.amountMinor!;
    const next = { ...current, category: updates.category ?? current.category, amountMinor, amount: fromMinor(amountMinor) };
    this.rows.set(id, next);
    return next;
  }
}

const unused = { execute: jest.fn() } as never;

// The signed-in Telegram user and the UUID their records are stored under
const TELEGRAM_ID = '131184740';
const OWNER_UUID = 'owner-uuid-ft097';
const users = {
  getGetOrCreateUserUseCase: () => ({ execute: jest.fn().mockResolvedValue({ id: OWNER_UUID }) }),
  getGetUserUseCase: () => ({ execute: jest.fn().mockResolvedValue({ success: true, data: { id: OWNER_UUID } }) }),
} as unknown as UserModule;

describe('FT-097: every writer may send amountMinor or the old amount', () => {
  let repository: MemoryTransactions;
  let server: http.Server;
  let baseUrl: string;

  beforeEach(done => {
    repository = new MemoryTransactions();
    const repo = repository as unknown as TransactionRepository;
    const app = express();
    app.use(express.json());
    app.use('/api/transactions', createTransactionRouter(
      new CreateTransactionUseCase(repo),
      unused,
      unused,
      unused,
      new GetTransactionByIdUseCase(repo),
      unused,
      new UpdateTransactionUseCase(repo),
      new UpdateTransactionWithLearningUseCase(repo),
      unused, unused, unused, unused, unused,
      undefined,
      users
    ));
    app.use(errorHandler);
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      done();
    });
  });

  afterEach(done => {
    server.close(done);
  });

  // Signed in through the local dev header, so the test exercises the amount path only
  const json = (method: string, url: string, body: unknown) =>
    fetch(`${baseUrl}${url}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Dev-User-Id': TELEGRAM_ID },
      body: JSON.stringify(body),
    });

  const base = { userId: TELEGRAM_ID, type: 'expense', category: 'coffee', description: 'Кофе', date: '2026-10-16' };
  const owned = { ...base, userId: OWNER_UUID };

  it('POST from TransactionForm / QuickAddSheet with the old amount in сум', async () => {
    const res = await json('POST', '/api/transactions', { ...base, amount: 25000 });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.transaction).toMatchObject({ amount: 25000, amountMinor: 2500000 });
    expect(repository.rows.get(body.data.id)?.amountMinor).toBe(2500000);
  });

  it('POST with amountMinor only, including 250 000 000 сум', async () => {
    const res = await json('POST', '/api/transactions', { ...base, amountMinor: 25000000000 });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.transaction).toMatchObject({ amount: 250000000, amountMinor: 25000000000 });
  });

  it('POST refuses an amount and amountMinor that disagree', async () => {
    const res = await json('POST', '/api/transactions', { ...base, amount: 100, amountMinor: 1 });

    expect(res.status).toBe(400);
    expect(repository.rows.size).toBe(0);
  });

  it('PUT from TransactionForm with the old amount, and with amountMinor', async () => {
    const created = await repository.create({ ...owned, type: 'expense', amount: 25000 });

    const legacy = await json('PUT', `/api/transactions/${created.id}`, { amount: 28000 });
    expect(legacy.status).toBe(200);
    expect(repository.rows.get(created.id!)?.amountMinor).toBe(2800000);

    const modern = await json('PUT', `/api/transactions/${created.id}`, { amountMinor: 2950050 });
    expect(modern.status).toBe(200);
    expect((await modern.json()).data).toMatchObject({ amountMinor: 2950050, amount: 29500.5 });
  });

  it('PUT with learning stores minor units and teaches the parser in сум', async () => {
    const created = await repository.create({ ...owned, type: 'expense', amount: 25000 });

    const res = await json('PUT', `/api/transactions/${created.id}`, {
      amount: 30000,
      userId: TELEGRAM_ID,
      originalText: 'кофе 25к',
      originalParsing: { amount: 25000, category: 'coffee', type: 'expense' },
    });

    expect(res.status).toBe(200);
    expect(repository.rows.get(created.id!)?.amountMinor).toBe(3000000);
    expect(transactionLearning.recordCorrection).toHaveBeenCalledWith(
      'кофе 25к',
      expect.objectContaining({ amount: 25000 }),
      { amount: 30000 },
      // The record's owner, not the userId the body names
      OWNER_UUID,
      0.8
    );
  });

  it('bot quick-add and the AI parser send amount in сум through CreateTransactionUseCase', async () => {
    const create = new CreateTransactionUseCase(repository as unknown as TransactionRepository);

    const quickAdd = await create.execute({
      userId: 'user-1', amount: 18000, category: 'taxi', type: 'expense', description: 'Такси', date: '2026-10-16',
    });
    const parsed = await create.execute({
      userId: 'user-1', amount: 186400.5, category: 'groceries', type: 'expense', description: 'Супермаркет', date: '2026-10-16',
      merchant: 'Korzinka', confidence: 0.9, originalText: 'корзинка 186400.5',
      originalParsing: { amount: 186400.5, category: 'groceries', type: 'expense' },
    });

    expect(quickAdd.success && parsed.success).toBe(true);
    const stored = [...repository.rows.values()].map(t => t.amountMinor);
    expect(stored).toEqual([1800000, 18640050]);
  });

  it('a debt with money transferred writes its linked record in minor units', async () => {
    const debts = {
      create: jest.fn(async data => ({ id: 'debt-1', userId: data.userId, personName: data.personName, originalAmount: data.amount })),
    } as unknown as DebtRepository;
    const createDebt = new CreateDebtUseCase(debts, new CreateTransactionUseCase(repository as unknown as TransactionRepository));

    const result = await createDebt.execute({
      userId: 'user-1', type: DebtType.OWED_TO_ME, personName: 'Азиз', amount: 300000, moneyTransferred: true,
    });

    expect(result.success).toBe(true);
    expect([...repository.rows.values()].map(t => t.amountMinor)).toEqual([30000000]);
  });
});
