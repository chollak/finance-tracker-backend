import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { createTransactionRouter } from '../src/modules/transaction/presentation/controllers/transactionController';
import { DeleteTransactionUseCase, RestoreTransactionUseCase } from '../src/modules/transaction/application/deleteTransaction';
import { GetTransactionByIdUseCase } from '../src/modules/transaction/application/getTransactionById';
import { AnalyticsService } from '../src/modules/transaction/application/analyticsService';
import { errorHandler } from '../src/delivery/web/express/middleware/errorMiddleware';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';

const unused = { execute: jest.fn() } as never;

describe('soft delete and restore of records (FT-105)', () => {
  let db: TestDatabase;
  let records: ReturnType<typeof recordsOn>;

  beforeEach(async () => {
    db = await openMigratedDatabase();
    records = recordsOn(db.dataSource);
  });

  afterEach(async () => {
    await db.close();
  });

  async function record(amount: number, userId = 'user-1', date = '2026-10-16') {
    const created = await records.create.execute({ userId, amount, type: 'expense', category: 'Кафе', description: 'кофе', date });
    if (!created.success) throw created.error;
    return created.data;
  }

  const balance = async (userId = 'user-1') => (await records.book.summary(userId)).accounts[0].balanceMinor;

  it('a deleted record leaves every read and the balance; restoring brings it back', async () => {
    const kept = await record(10000);
    const gone = await record(25000);

    await records.repository.delete(gone);

    expect(await records.repository.findById(gone)).toBeNull();
    expect(await records.repository.findByIdIncludingArchived(gone)).toBeNull();
    expect((await records.repository.findByUserId('user-1')).map(r => r.id)).toEqual([kept]);
    expect((await records.repository.getAll()).map(r => r.id)).toEqual([kept]);
    expect((await records.repository.getByUserIdAndDateRange('user-1', new Date('2026-10-01'), new Date('2026-10-31'))).map(r => r.id)).toEqual([kept]);
    expect(await balance()).toBe(-1000000);
    const analytics = new AnalyticsService(records.repository);
    expect((await analytics.getAnalyticsSummary('user-1')).totalExpense).toBe(10000);

    const deleted = await records.repository.findByIdIncludingDeleted(gone);
    expect(deleted?.deletedAt).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
    // A deleted record cannot be edited
    expect((await records.update.execute({ id: gone, amount: 1 })).success).toBe(false);

    const restored = await records.repository.restore(gone);
    expect(restored).toMatchObject({ id: gone, amountMinor: 2500000 });
    expect(restored.deletedAt).toBeUndefined();
    expect((await records.repository.findByUserId('user-1')).map(r => r.id).sort()).toEqual([kept, gone].sort());
    expect(await balance()).toBe(-3500000);
  });

  it('the record counter goes down on delete and up on restore, once', async () => {
    const id = await record(25000);
    const increment = jest.fn().mockResolvedValue(undefined);
    const decrement = jest.fn().mockResolvedValue(undefined);
    const subscriptions = {
      getIncrementUsageUseCase: () => ({ execute: increment }),
      getDecrementUsageUseCase: () => ({ execute: decrement }),
    } as never;
    const users = { getGetOrCreateUserUseCase: () => ({ execute: jest.fn().mockResolvedValue({ id: 'uuid-1' }) }) } as never;
    const remove = new DeleteTransactionUseCase(records.repository);
    const restore = new RestoreTransactionUseCase(records.repository);
    remove.setSubscriptionDependencies(subscriptions, users);
    restore.setSubscriptionDependencies(subscriptions, users);

    expect((await remove.execute({ id })).success).toBe(true);
    expect(decrement).toHaveBeenCalledWith({ userId: 'uuid-1', limitType: 'transactions' });

    const back = await restore.execute({ id });
    expect(back.success && back.data.id).toBe(id);
    expect((await restore.execute({ id })).success).toBe(true);
    expect(increment).toHaveBeenCalledTimes(1);

    const unknown = await restore.execute({ id: 'nope' });
    expect(!unknown.success && (unknown.error as { statusCode?: number }).statusCode).toBe(404);
  });

  describe('DELETE /api/transactions/:id and POST /api/transactions/:id/restore', () => {
    let server: http.Server;
    let baseUrl: string;

    beforeEach(done => {
      const app = express();
      app.use(express.json());
      app.use('/api/transactions', createTransactionRouter(
        records.create, unused, unused, unused,
        new GetTransactionByIdUseCase(records.repository),
        new DeleteTransactionUseCase(records.repository),
        records.update, unused, unused, unused, unused, unused, unused,
        undefined, undefined,
        new RestoreTransactionUseCase(records.repository)
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

    const call = async (method: string, url: string) => {
      const res = await fetch(`${baseUrl}${url}`, { method, headers: { 'Content-Type': 'application/json' } });
      return { status: res.status, body: await res.json() };
    };

    it('deletes softly, restores, and answers 404 for what is gone or unknown', async () => {
      // Guest ids pass the ownership check without Telegram auth
      const id = await record(25000, 'guest_ft105');

      const deleted = await call('DELETE', `/api/transactions/${id}`);
      expect(deleted.status).toBe(200);
      expect(deleted.body.data).toMatchObject({ id });
      expect((await call('GET', `/api/transactions/${id}`)).status).toBe(404);
      expect((await call('DELETE', `/api/transactions/${id}`)).status).toBe(404);

      const restored = await call('POST', `/api/transactions/${id}/restore`);
      expect(restored.status).toBe(200);
      expect(restored.body.data).toMatchObject({ id, amountMinor: 2500000, category: 'Кафе' });
      expect((await call('GET', `/api/transactions/${id}`)).status).toBe(200);

      expect((await call('POST', '/api/transactions/unknown-id/restore')).status).toBe(404);
    });
  });
});
