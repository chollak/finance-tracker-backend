import 'reflect-metadata';
import { SqliteSubscriptionRepository } from '../src/modules/subscription/infrastructure/SqliteSubscriptionRepository';
import { GrantPremiumUseCase, StartTrialUseCase } from '../src/modules/subscription/application/grantPremium';
import { CreateSubscriptionUseCase } from '../src/modules/subscription/application/createSubscription';
import { Subscription, SUBSCRIPTION_PRICE_STARS } from '../src/modules/subscription/domain/subscription';
import { GrantTargets } from '../src/modules/subscription/domain/grantTargets';
import { Result } from '../src/shared/domain/types/Result';
import { prepareDatabaseOnce, TestDatabase } from './helpers/testDatabase';

/**
 * #256: the price a subscription is stored with, on a real SQLite file. A gift, a lifetime grant and a trial cost
 * 0 Stars; `create` turned that 0 into the default 100 (`0 || 100`), so a gift looked paid. A payment keeps the price
 * it was paid with, and one that names none gets the price from the configuration.
 */

/** Every id is a user: the target is not what these cases are about (#230). */
const ANYONE: GrantTargets = { exists: async () => true };

function grantedOf(result: Result<Subscription>): Subscription {
  if (!result.success) throw result.error;
  return result.data;
}

describe('the price a subscription is stored with (#256)', () => {
  let db: TestDatabase;
  let repository: SqliteSubscriptionRepository;
  const migrated = prepareDatabaseOnce();

  beforeEach(async () => {
    db = await migrated.open();
    repository = new SqliteSubscriptionRepository(db.dataSource);
  });

  afterEach(async () => {
    await db.close();
  });

  /** The price as the row holds it, and as the repository reads it back. */
  async function storedPrice(id: string): Promise<{ row: number; read: number | undefined }> {
    const [row] = await db.dataSource.query(`SELECT price_stars FROM subscriptions WHERE id = ?`, [id]);
    return { row: Number(row.price_stars), read: (await repository.findById(id))?.priceStars };
  }

  it.each([
    ['a gift for a number of days', false],
    ['a lifetime grant', true],
  ])('%s is stored at 0 Stars', async (_name, isLifetime) => {
    const grant = new GrantPremiumUseCase(repository, ANYONE);

    const subscription = grantedOf(await grant.execute({ userId: 'user-1', grantedBy: 'admin-1', isLifetime, durationDays: 7 }));

    expect(subscription.priceStars).toBe(0);
    expect(await storedPrice(subscription.id)).toEqual({ row: 0, read: 0 });
  });

  it('a trial is stored at 0 Stars', async () => {
    const trial = await new StartTrialUseCase(repository).execute({ userId: 'user-1' });

    expect(await storedPrice(trial!.id)).toEqual({ row: 0, read: 0 });
  });

  it('a payment keeps the price it was paid with: the invoice amount from the configuration', async () => {
    const create = new CreateSubscriptionUseCase(repository);

    // What the bot passes after successful_payment: Telegram's total_amount of the invoice, SUBSCRIPTION_PRICE_STARS
    const subscription = await create.execute({ userId: 'user-1', tier: 'premium', source: 'payment', priceStars: SUBSCRIPTION_PRICE_STARS });

    expect(await storedPrice(subscription.id)).toEqual({ row: SUBSCRIPTION_PRICE_STARS, read: SUBSCRIPTION_PRICE_STARS });
  });

  it('a payment that names no price gets the one from the configuration', async () => {
    const create = new CreateSubscriptionUseCase(repository);

    const subscription = await create.execute({ userId: 'user-1', tier: 'premium', source: 'payment' });

    expect(await storedPrice(subscription.id)).toEqual({ row: SUBSCRIPTION_PRICE_STARS, read: SUBSCRIPTION_PRICE_STARS });
  });
});
