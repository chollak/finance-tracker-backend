import 'reflect-metadata';
import { SubscriptionModule } from '../src/modules/subscription/subscriptionModule';
import { SqliteUsageLimitRepository } from '../src/modules/subscription/infrastructure/SqliteUsageLimitRepository';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { DeleteTransactionUseCase, RestoreTransactionUseCase } from '../src/modules/transaction/application/deleteTransaction';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';
import { todayDateOnly } from '../src/shared/domain/dates/dateOnly';

/**
 * FT-171: the free-tier record counter belongs to the record's owner. A record's userId is already the
 * user's UUID; it used to go to getOrCreate as a telegramId, which added a phantom user (its telegram_id
 * the real user's UUID) and counted the record on it.
 */
describe('the record counter counts on the record owner (FT-171)', () => {
  const telegramId = '131184740';
  let db: TestDatabase;
  let records: ReturnType<typeof recordsOn>;
  let ownerId: string;
  let subscriptions: SubscriptionModule;
  let users: UserModule;

  beforeEach(async () => {
    db = await openMigratedDatabase();
    records = recordsOn(db.dataSource);
    users = new UserModule(new SqliteUserRepository(db.dataSource));
    // Counting needs only the usage limits; subscriptions and grants are not touched
    subscriptions = new SubscriptionModule({} as never, new SqliteUsageLimitRepository(db.dataSource), {} as never);
    records.create.setSubscriptionDependencies(subscriptions, users);
    // /start in the bot creates the user before the first record
    ownerId = (await users.getGetOrCreateUserUseCase().execute({ telegramId })).id;
  });

  afterEach(async () => {
    await db.close();
  });

  const userRows = async () => Number((await db.dataSource.query(`SELECT COUNT(*) AS n FROM users`))[0].n);
  const counted = async () =>
    (await db.dataSource.query(`SELECT user_id, transactions_count FROM usage_limits ORDER BY user_id`)) as Array<{
      user_id: string;
      transactions_count: number;
    }>;

  async function record(userId: string): Promise<string> {
    const created = await records.create.execute({
      userId,
      amount: 25000,
      type: 'expense',
      category: 'Кафе',
      description: 'кофе',
      date: todayDateOnly(),
    });
    if (!created.success) throw created.error;
    return created.data;
  }

  it('a record from the user UUID adds no user and counts on that user', async () => {
    await record(ownerId);

    expect(await userRows()).toBe(1);
    expect(await counted()).toEqual([{ user_id: ownerId, transactions_count: 1 }]);
  });

  it('a record that names the Telegram id counts on the user with that Telegram id', async () => {
    await record(telegramId);

    expect(await userRows()).toBe(1);
    expect(await counted()).toEqual([{ user_id: ownerId, transactions_count: 1 }]);
  });

  it('deleting and restoring a record move the owner counter and add no user', async () => {
    const remove = new DeleteTransactionUseCase(records.repository);
    const restore = new RestoreTransactionUseCase(records.repository);
    remove.setSubscriptionDependencies(subscriptions, users);
    restore.setSubscriptionDependencies(subscriptions, users);
    const first = await record(ownerId);
    await record(ownerId);

    // The delete reads the owner from the record
    expect((await remove.execute({ id: first })).success).toBe(true);
    expect(await counted()).toEqual([{ user_id: ownerId, transactions_count: 1 }]);

    expect((await restore.execute({ id: first })).success).toBe(true);
    expect(await counted()).toEqual([{ user_id: ownerId, transactions_count: 2 }]);

    expect((await remove.execute({ id: first })).success).toBe(true);
    expect(await counted()).toEqual([{ user_id: ownerId, transactions_count: 1 }]);
    expect(await userRows()).toBe(1);
  });

  it('two deletes of one record at once delete it once and free one slot (#383)', async () => {
    const remove = new DeleteTransactionUseCase(records.repository);
    remove.setSubscriptionDependencies(subscriptions, users);
    const first = await record(ownerId);
    await record(ownerId);
    // The Mini App and the bot delete the same record at once: both read it not deleted before either writes
    const bothRead = barrier(2);
    const findById = records.repository.findById.bind(records.repository);
    jest.spyOn(records.repository, 'findById').mockImplementation(async id => {
      const found = await findById(id);
      await bothRead();
      return found;
    });

    const results = await Promise.all([remove.execute({ id: first }), remove.execute({ id: first })]);

    expect(results.map(result => result.success)).toEqual([true, true]);
    const deleted = await db.dataSource.query(`SELECT id FROM transactions WHERE deleted_at IS NOT NULL`);
    expect(deleted).toEqual([{ id: first }]);
    expect(await counted()).toEqual([{ user_id: ownerId, transactions_count: 1 }]);
  });

  it('two restores of one record at once bring it back once and take one slot (#383)', async () => {
    const remove = new DeleteTransactionUseCase(records.repository);
    const restore = new RestoreTransactionUseCase(records.repository);
    remove.setSubscriptionDependencies(subscriptions, users);
    restore.setSubscriptionDependencies(subscriptions, users);
    const first = await record(ownerId);
    await record(ownerId);
    expect((await remove.execute({ id: first })).success).toBe(true);
    // «Отменить» in the Mini App and in the bot at once: both read the record deleted before either writes
    const bothRead = barrier(2);
    const findByIdIncludingDeleted = records.repository.findByIdIncludingDeleted.bind(records.repository);
    jest.spyOn(records.repository, 'findByIdIncludingDeleted').mockImplementation(async id => {
      const found = await findByIdIncludingDeleted(id);
      await bothRead();
      return found;
    });

    const results = await Promise.all([restore.execute({ id: first }), restore.execute({ id: first })]);

    for (const result of results) {
      expect(result.success && result.data).toMatchObject({ id: first });
      expect(result.success && result.data.deletedAt).toBeUndefined();
    }
    expect(await db.dataSource.query(`SELECT id FROM transactions WHERE deleted_at IS NOT NULL`)).toEqual([]);
    expect(await counted()).toEqual([{ user_id: ownerId, transactions_count: 2 }]);
  });
});

/** Holds every caller until `count` of them wait, then lets them all go. */
function barrier(count: number): () => Promise<void> {
  let waiting = 0;
  let release: () => void = () => undefined;
  const allWaiting = new Promise<void>(resolve => {
    release = resolve;
  });
  return () => {
    waiting += 1;
    if (waiting === count) release();
    return allWaiting;
  };
}
