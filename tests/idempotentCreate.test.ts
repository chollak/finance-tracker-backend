import express from 'express';
import http from 'http';
import { createTransactionRouter } from '../src/modules/transaction/presentation/controllers/transactionController';
import { GetTransactionByIdUseCase } from '../src/modules/transaction/application/getTransactionById';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';
import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { QuickCaptureService } from '../src/modules/quickCapture/application/quickCaptureService';
import { errorHandler } from '../src/delivery/web/express/middleware/errorMiddleware';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';
import { listenOnLoopback } from './helpers/testServer';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';

const CLIENT_ID = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const unused = { execute: jest.fn() } as never;

describe('idempotent create for the offline queue (FT-106)', () => {
  let db: TestDatabase;
  let records: ReturnType<typeof recordsOn>;

  beforeEach(async () => {
    db = await openMigratedDatabase();
    records = recordsOn(db.dataSource);
  });

  afterEach(async () => {
    await db.close();
  });

  const coffee = (overrides: Partial<Transaction> = {}): Transaction => ({
    userId: 'user-1', amount: 25000, type: 'expense', category: 'Кафе', description: 'кофе', date: '2026-10-16', clientId: CLIENT_ID, ...overrides,
  });
  const count = async () => Number((await db.dataSource.query('SELECT COUNT(*) AS n FROM transactions'))[0].n);

  it('a repeat returns the same record and counts it once', async () => {
    const increment = jest.fn().mockResolvedValue(undefined);
    records.create.setSubscriptionDependencies(
      { getIncrementUsageUseCase: () => ({ execute: increment }) } as never,
      { getGetOrCreateUserUseCase: () => ({ execute: jest.fn().mockResolvedValue({ id: 'uuid-1' }) }) } as never
    );
    const first = await records.create.execute(coffee());
    const onRepeat = jest.fn();
    const second = await records.create.execute(coffee({ amount: 99999 }), { onRepeat });

    expect(first.success && second.success && first.data === second.data).toBe(true);
    expect(onRepeat).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 2500000, clientId: CLIENT_ID }));
    expect(await count()).toBe(1);
    expect(increment).toHaveBeenCalledTimes(1);

    // The same clientId of another user is another record
    const other = await records.create.execute(coffee({ userId: 'user-2' }));
    expect(other.success && first.success && other.data !== first.data).toBe(true);
  });

  it('a repeat after the record was deleted returns it with deletedAt and creates nothing', async () => {
    const first = await records.create.execute(coffee());
    if (!first.success) throw first.error;
    await records.repository.delete(first.data);

    let repeat: Transaction | undefined;
    const second = await records.create.execute(coffee(), { onRepeat: existing => { repeat = existing; } });

    expect(second.success && second.data).toBe(first.data);
    expect(repeat?.deletedAt).toEqual(expect.any(String));
    expect(await count()).toBe(1);
  });

  it('two identical requests at once make one record', async () => {
    const results = await Promise.all([records.create.execute(coffee()), records.create.execute(coffee()), records.create.execute(coffee())]);

    const ids = results.map(result => (result.success ? result.data : result.error.message));
    expect(new Set(ids).size).toBe(1);
    expect(await count()).toBe(1);
  });

  it('refuses a malformed clientId', async () => {
    const result = await records.create.execute(coffee({ clientId: 'a b' }));
    expect(!result.success && result.error.message).toMatch(/clientId/);
  });

  describe('POST /api/transactions', () => {
    let server: http.Server;
    let baseUrl: string;

    beforeEach(async () => {
      const app = express();
      app.use(express.json());
      app.use('/api/transactions', createTransactionRouter(
        records.create, unused, unused, unused, new GetTransactionByIdUseCase(records.repository),
        unused, records.update, unused, unused, unused, unused, unused, unused,
        undefined, new UserModule(new SqliteUserRepository(db.dataSource))
      ));
      app.use(errorHandler);
      ({ server, baseUrl } = await listenOnLoopback(app));
    });

    afterEach(done => {
      server.close(done);
    });

    // Signed in as Telegram user 131184740 through the local dev header
    const post = async (body: unknown) => {
      const res = await fetch(`${baseUrl}/api/transactions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Dev-User-Id': '131184740' }, body: JSON.stringify(body),
      });
      return { status: res.status, body: await res.json() };
    };
    const body = { userId: '131184740', amountMinor: 2500000, type: 'expense', category: 'Кафе', description: 'кофе', date: '2026-10-16', clientId: CLIENT_ID };

    it('answers 201 the first time and 200 with the same record on a repeat', async () => {
      const first = await post(body);
      const second = await post(body);

      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      expect(second.body.data).toMatchObject({ id: first.body.data.id, repeated: true, transaction: { id: first.body.data.id, clientId: CLIENT_ID } });
      expect((await post({ ...body, clientId: 'with space' })).status).toBe(400);
    });
  });

  describe('quick capture', () => {
    let openAI: { analyzeInput: jest.Mock };
    let pipeline: ProcessTextInputUseCase;
    let service: QuickCaptureService;

    beforeEach(() => {
      openAI = { analyzeInput: jest.fn() };
      pipeline = new ProcessTextInputUseCase(openAI as unknown as TranscriptionService, records.create, undefined, records.catalog);
      service = new QuickCaptureService(pipeline, records.repository);
    });

    it('a repeat answers with the records of the first capture, in order, without parsing again', async () => {
      openAI.analyzeInput.mockResolvedValue({
        transactions: [
          { intent: 'transaction', amount: 18000, category: 'Транспорт', type: 'expense', date: '2026-10-16', description: 'такси' },
          { intent: 'transaction', amount: 25000, category: 'Кафе', type: 'expense', date: '2026-10-16', description: 'кофе' },
        ],
        debts: [],
      });
      const request = { text: 'такси 18к и кофе 25к', userId: 'user-1', clientId: CLIENT_ID };

      const first = await service.capture(request);
      const execute = jest.spyOn(pipeline, 'execute');
      const second = await service.capture(request);

      expect(first.transactions).toHaveLength(2);
      expect(second.repeated).toBe(true);
      expect(second.transactions.map(t => [t.id, t.amount, t.category])).toEqual(first.transactions.map(t => [t.id, t.amount, t.category]));
      // The review screen (FT-114) reads the category by id and the amount in minor units, on a repeat too
      expect(second.transactions.map(t => [t.categoryId, t.amountMinor])).toEqual(first.transactions.map(t => [t.categoryId, t.amountMinor]));
      expect(first.transactions.map(t => t.amountMinor)).toEqual([1800000, 2500000]);
      expect(first.transactions.every(t => typeof t.categoryId === 'string')).toBe(true);
      expect(second.status).toBe('saved');
      expect(execute).not.toHaveBeenCalled();
      expect(openAI.analyzeInput).toHaveBeenCalledTimes(1);
      expect((await db.dataSource.query('SELECT client_id FROM transactions ORDER BY client_id')).map((r: { client_id: string }) => r.client_id))
        .toEqual([CLIENT_ID, `${CLIENT_ID}:1`]);

      await records.repository.delete(first.transactions[1].id);
      const afterDelete = await service.capture(request);
      expect(afterDelete.transactions[1]).toMatchObject({ id: first.transactions[1].id, deletedAt: expect.any(String) });
      expect(afterDelete.transactions[0].deletedAt).toBeUndefined();
    });

    it('a retry while the first capture is still being parsed waits for it instead of parsing again', async () => {
      let finish: (value: unknown) => void = () => undefined;
      openAI.analyzeInput.mockReturnValue(new Promise(resolve => { finish = resolve; }));
      const request = { text: 'обедали с коллегами. Вышло 45000', userId: 'user-1', clientId: CLIENT_ID };

      const first = service.capture(request);
      const retry = service.capture(request);
      finish({ transactions: [{ intent: 'transaction', amount: 45000, category: 'Кафе', type: 'expense', date: '2026-10-16' }], debts: [] });
      const [a, b] = await Promise.all([first, retry]);

      expect(openAI.analyzeInput).toHaveBeenCalledTimes(1);
      expect(b.repeated).toBe(true);
      expect(b.transactions.map(t => t.id)).toEqual(a.transactions.map(t => t.id));
      expect(await count()).toBe(1);
    });

    it('without a clientId every capture is new', async () => {
      await service.capture({ text: 'кофе 25000', userId: 'user-1' });
      await service.capture({ text: 'кофе 25000', userId: 'user-1' });
      expect(await count()).toBe(2);
    });
  });
});
