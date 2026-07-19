import { CreateSubscriptionUseCase } from '../src/modules/subscription/application/createSubscription';
import { GetSubscriptionUseCase } from '../src/modules/subscription/application/getSubscription';
import { GrantPremiumUseCase, StartTrialUseCase } from '../src/modules/subscription/application/grantPremium';
import { CheckLimitUseCase } from '../src/modules/subscription/application/checkLimit';
import {
  IncrementUsageUseCase,
  DecrementUsageUseCase,
  SetActiveDebtsCountUseCase,
} from '../src/modules/subscription/application/incrementUsage';
import { CancelSubscriptionUseCase } from '../src/modules/subscription/application/cancelSubscription';
import { SubscriptionService } from '../src/modules/subscription/application/subscriptionService';
import { SubscriptionRepository } from '../src/modules/subscription/domain/subscriptionRepository';
import { UsageLimitRepository } from '../src/modules/subscription/domain/usageLimitRepository';
import {
  Subscription,
  CreateSubscriptionDTO,
  UpdateSubscriptionDTO,
  SUBSCRIPTION_PRICE_STARS,
  TRIAL_DURATION_DAYS,
  MONTHLY_DURATION_DAYS,
} from '../src/modules/subscription/domain/subscription';
import {
  UsageLimit,
  CreateUsageLimitDTO,
  LimitType,
  FREE_TIER_LIMITS,
  getCurrentMonthPeriod,
  isPeriodExpired,
} from '../src/modules/subscription/domain/usageLimit';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * In-memory fake mirroring SqliteSubscriptionRepository's create()/update()
 * date computation and status filtering, without touching TypeORM/DB.
 */
class InMemorySubscriptionRepository implements SubscriptionRepository {
  private subscriptions = new Map<string, Subscription>();
  private seq = 0;

  async findById(id: string): Promise<Subscription | null> {
    return this.subscriptions.get(id) ?? null;
  }

  async findByUserId(userId: string): Promise<Subscription | null> {
    return this.latestFor(userId, () => true);
  }

  async findActiveByUserId(userId: string): Promise<Subscription | null> {
    return this.latestFor(userId, (s) => s.status === 'active');
  }

  async create(dto: CreateSubscriptionDTO): Promise<Subscription> {
    const startDate = new Date();
    let endDate: Date | null = null;
    let trialEndsAt: Date | null = null;

    if (dto.source === 'lifetime') {
      endDate = null;
    } else if (dto.source === 'trial') {
      const trialEnd = new Date(startDate.getTime() + TRIAL_DURATION_DAYS * DAY_MS);
      trialEndsAt = trialEnd;
      endDate = trialEnd;
    } else {
      const days = dto.durationDays || MONTHLY_DURATION_DAYS;
      endDate = new Date(startDate.getTime() + days * DAY_MS);
    }

    const id = `sub-${++this.seq}`;
    const subscription: Subscription = {
      id,
      userId: dto.userId,
      tier: dto.tier,
      source: dto.source,
      status: 'active',
      priceStars: dto.priceStars ?? SUBSCRIPTION_PRICE_STARS,
      currency: 'XTR',
      startDate,
      endDate,
      trialEndsAt,
      telegramPaymentChargeId: dto.telegramPaymentChargeId ?? null,
      providerPaymentChargeId: dto.providerPaymentChargeId ?? null,
      autoRenew: dto.source === 'payment',
      grantedBy: dto.grantedBy ?? null,
      grantNote: dto.grantNote ?? null,
      createdAt: startDate,
      updatedAt: startDate,
      cancelledAt: null,
      cancellationReason: null,
    };
    this.subscriptions.set(id, subscription);
    return subscription;
  }

  async update(id: string, dto: UpdateSubscriptionDTO): Promise<Subscription> {
    const existing = this.subscriptions.get(id);
    if (!existing) {
      throw new Error('Subscription not found after update');
    }
    const updated: Subscription = {
      ...existing,
      status: dto.status !== undefined ? dto.status : existing.status,
      endDate: dto.endDate !== undefined ? dto.endDate : existing.endDate,
      autoRenew: dto.autoRenew !== undefined ? dto.autoRenew : existing.autoRenew,
      cancelledAt: dto.cancelledAt !== undefined ? dto.cancelledAt : existing.cancelledAt,
      cancellationReason:
        dto.cancellationReason !== undefined ? dto.cancellationReason : existing.cancellationReason,
      updatedAt: new Date(),
    };
    this.subscriptions.set(id, updated);
    return updated;
  }

  async findExpiring(withinDays: number): Promise<Subscription[]> {
    const now = new Date();
    const futureDate = new Date(now.getTime() + withinDays * DAY_MS);
    return [...this.subscriptions.values()].filter(
      (s) => s.status === 'active' && s.endDate !== null && s.endDate < futureDate && s.endDate > now
    );
  }

  async findExpired(): Promise<Subscription[]> {
    const now = new Date();
    return [...this.subscriptions.values()].filter(
      (s) => s.status === 'active' && s.endDate !== null && s.endDate < now
    );
  }

  async markAsExpired(id: string): Promise<Subscription> {
    return this.update(id, { status: 'expired' });
  }

  private latestFor(userId: string, predicate: (s: Subscription) => boolean): Subscription | null {
    const matches = [...this.subscriptions.values()]
      .filter((s) => s.userId === userId && predicate(s))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return matches[0] ?? null;
  }
}

/**
 * In-memory fake mirroring SqliteUsageLimitRepository's period reset and
 * counter semantics (activeDebtsCount survives monthly reset).
 */
class InMemoryUsageLimitRepository implements UsageLimitRepository {
  private records = new Map<string, UsageLimit>();
  private seq = 0;

  async findByUserId(userId: string): Promise<UsageLimit | null> {
    return this.records.get(userId) ?? null;
  }

  async findOrCreateForCurrentPeriod(userId: string): Promise<UsageLimit> {
    const existing = this.records.get(userId);
    if (existing) {
      if (isPeriodExpired(existing.periodEnd)) {
        return this.resetMonthlyCounters(userId);
      }
      return existing;
    }
    return this.create({ userId });
  }

  async create(dto: CreateUsageLimitDTO): Promise<UsageLimit> {
    const period = getCurrentMonthPeriod();
    const now = new Date();
    const record: UsageLimit = {
      id: `usage-${++this.seq}`,
      userId: dto.userId,
      periodStart: dto.periodStart ?? period.start,
      periodEnd: dto.periodEnd ?? period.end,
      transactionsCount: 0,
      voiceInputsCount: 0,
      activeDebtsCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(dto.userId, record);
    return record;
  }

  async incrementCounter(userId: string, limitType: LimitType): Promise<UsageLimit> {
    await this.findOrCreateForCurrentPeriod(userId);
    const existing = this.records.get(userId)!;
    const updated = this.applyDelta(existing, limitType, 1);
    this.records.set(userId, updated);
    return updated;
  }

  async decrementCounter(userId: string, limitType: LimitType): Promise<UsageLimit> {
    await this.findOrCreateForCurrentPeriod(userId);
    const existing = this.records.get(userId)!;
    const updated = this.applyDelta(existing, limitType, -1);
    this.records.set(userId, updated);
    return updated;
  }

  async setActiveDebtsCount(userId: string, count: number): Promise<UsageLimit> {
    await this.findOrCreateForCurrentPeriod(userId);
    const existing = this.records.get(userId)!;
    const updated: UsageLimit = { ...existing, activeDebtsCount: Math.max(0, count), updatedAt: new Date() };
    this.records.set(userId, updated);
    return updated;
  }

  async resetMonthlyCounters(userId: string): Promise<UsageLimit> {
    const existing = this.records.get(userId);
    const period = getCurrentMonthPeriod();
    if (existing) {
      const updated: UsageLimit = {
        ...existing,
        periodStart: period.start,
        periodEnd: period.end,
        transactionsCount: 0,
        voiceInputsCount: 0,
        updatedAt: new Date(),
      };
      this.records.set(userId, updated);
      return updated;
    }
    return this.create({ userId });
  }

  private applyDelta(existing: UsageLimit, limitType: LimitType, delta: number): UsageLimit {
    const updatedAt = new Date();
    switch (limitType) {
      case 'transactions':
        return { ...existing, transactionsCount: Math.max(0, existing.transactionsCount + delta), updatedAt };
      case 'voice_inputs':
        return { ...existing, voiceInputsCount: Math.max(0, existing.voiceInputsCount + delta), updatedAt };
      case 'debts':
        return { ...existing, activeDebtsCount: Math.max(0, existing.activeDebtsCount + delta), updatedAt };
    }
  }
}

describe('Subscription module', () => {
  let subscriptionRepo: InMemorySubscriptionRepository;
  let usageLimitRepo: InMemoryUsageLimitRepository;

  beforeEach(() => {
    subscriptionRepo = new InMemorySubscriptionRepository();
    usageLimitRepo = new InMemoryUsageLimitRepository();
    jest.useFakeTimers().setSystemTime(new Date('2026-07-19T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('StartTrialUseCase', () => {
    it('starts a trial for a brand-new user with a 14-day window', async () => {
      const useCase = new StartTrialUseCase(subscriptionRepo);

      const result = await useCase.execute({ userId: 'user-1' });

      expect(result).not.toBeNull();
      expect(result!.tier).toBe('premium');
      expect(result!.source).toBe('trial');
      expect(result!.status).toBe('active');
      expect(result!.trialEndsAt).toEqual(new Date('2026-08-02T12:00:00.000Z'));
      expect(result!.endDate).toEqual(result!.trialEndsAt);
    });

    it('refuses a second trial once the user has any subscription history', async () => {
      const useCase = new StartTrialUseCase(subscriptionRepo);
      await useCase.execute({ userId: 'user-1' });

      const second = await useCase.execute({ userId: 'user-1' });

      expect(second).toBeNull();
      const all = await subscriptionRepo.findByUserId('user-1');
      expect(all?.source).toBe('trial');
    });

    it('refuses a trial for a user whose only subscription is expired/cancelled', async () => {
      const createUseCase = new CreateSubscriptionUseCase(subscriptionRepo);
      await createUseCase.execute({ userId: 'user-1', tier: 'premium', source: 'payment' });

      const useCase = new StartTrialUseCase(subscriptionRepo);
      const result = await useCase.execute({ userId: 'user-1' });

      expect(result).toBeNull();
    });
  });

  describe('CheckLimitUseCase', () => {
    it('allows usage below the free-tier transaction limit and reports remaining count', async () => {
      const useCase = new CheckLimitUseCase(subscriptionRepo, usageLimitRepo);
      for (let i = 0; i < 10; i++) {
        await usageLimitRepo.incrementCounter('user-1', 'transactions');
      }

      const result = await useCase.execute({ userId: 'user-1', limitType: 'transactions' });

      expect(result.allowed).toBe(true);
      expect(result.isPremium).toBe(false);
      expect(result.currentUsage).toBe(10);
      expect(result.limit).toBe(FREE_TIER_LIMITS.transactions);
      expect(result.remaining).toBe(FREE_TIER_LIMITS.transactions - 10);
      expect(result.message).toBeUndefined();
    });

    it('blocks usage once the free-tier transaction limit is reached and returns a message', async () => {
      const useCase = new CheckLimitUseCase(subscriptionRepo, usageLimitRepo);
      for (let i = 0; i < FREE_TIER_LIMITS.transactions; i++) {
        await usageLimitRepo.incrementCounter('user-1', 'transactions');
      }

      const result = await useCase.execute({ userId: 'user-1', limitType: 'transactions' });

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.message).toContain(String(FREE_TIER_LIMITS.transactions));
    });

    it('grants unlimited access with no limit/remaining fields for an active premium user', async () => {
      const createUseCase = new CreateSubscriptionUseCase(subscriptionRepo);
      await createUseCase.execute({ userId: 'user-1', tier: 'premium', source: 'payment' });
      for (let i = 0; i < 999; i++) {
        await usageLimitRepo.incrementCounter('user-1', 'voice_inputs');
      }

      const useCase = new CheckLimitUseCase(subscriptionRepo, usageLimitRepo);
      const result = await useCase.execute({ userId: 'user-1', limitType: 'voice_inputs' });

      expect(result.allowed).toBe(true);
      expect(result.isPremium).toBe(true);
      expect(result.limit).toBeNull();
      expect(result.remaining).toBeNull();
      expect(result.currentUsage).toBe(999);
    });

    it('treats an expired premium subscription as free tier', async () => {
      const createUseCase = new CreateSubscriptionUseCase(subscriptionRepo);
      const sub = await createUseCase.execute({
        userId: 'user-1',
        tier: 'premium',
        source: 'payment',
        durationDays: 5,
      });
      // Fast-forward past the paid period.
      jest.setSystemTime(new Date(sub.startDate.getTime() + 6 * DAY_MS));

      const useCase = new CheckLimitUseCase(subscriptionRepo, usageLimitRepo);
      const result = await useCase.execute({ userId: 'user-1', limitType: 'debts' });

      expect(result.isPremium).toBe(false);
      expect(result.limit).toBe(FREE_TIER_LIMITS.activeDebts);
    });

    it('enforces the active-debts limit independently from monthly counters', async () => {
      const useCase = new CheckLimitUseCase(subscriptionRepo, usageLimitRepo);
      await usageLimitRepo.setActiveDebtsCount('user-1', FREE_TIER_LIMITS.activeDebts);

      const result = await useCase.execute({ userId: 'user-1', limitType: 'debts' });

      expect(result.allowed).toBe(false);
      expect(result.currentUsage).toBe(FREE_TIER_LIMITS.activeDebts);
    });
  });

  describe('IncrementUsageUseCase / DecrementUsageUseCase / SetActiveDebtsCountUseCase', () => {
    it('increments the requested counter and leaves the others untouched', async () => {
      const increment = new IncrementUsageUseCase(usageLimitRepo);

      const result = await increment.execute({ userId: 'user-1', limitType: 'voice_inputs' });

      expect(result.voiceInputsCount).toBe(1);
      expect(result.transactionsCount).toBe(0);
      expect(result.activeDebtsCount).toBe(0);
    });

    it('decrements a counter but never goes below zero', async () => {
      const decrement = new DecrementUsageUseCase(usageLimitRepo);

      const result = await decrement.execute({ userId: 'user-1', limitType: 'transactions' });

      expect(result.transactionsCount).toBe(0);
    });

    it('decrements down to but not below zero after prior increments', async () => {
      const increment = new IncrementUsageUseCase(usageLimitRepo);
      const decrement = new DecrementUsageUseCase(usageLimitRepo);
      await increment.execute({ userId: 'user-1', limitType: 'transactions' });

      const first = await decrement.execute({ userId: 'user-1', limitType: 'transactions' });
      const second = await decrement.execute({ userId: 'user-1', limitType: 'transactions' });

      expect(first.transactionsCount).toBe(0);
      expect(second.transactionsCount).toBe(0);
    });

    it('sets the active debts count directly, clamped at zero', async () => {
      const setCount = new SetActiveDebtsCountUseCase(usageLimitRepo);

      const result = await setCount.execute({ userId: 'user-1', count: -3 });

      expect(result.activeDebtsCount).toBe(0);
    });

    it('resets monthly counters but preserves activeDebtsCount once the period expires', async () => {
      const increment = new IncrementUsageUseCase(usageLimitRepo);
      const setCount = new SetActiveDebtsCountUseCase(usageLimitRepo);
      await increment.execute({ userId: 'user-1', limitType: 'transactions' });
      await setCount.execute({ userId: 'user-1', count: 2 });

      // Jump into next month so findOrCreateForCurrentPeriod triggers a reset.
      jest.setSystemTime(new Date('2026-09-01T00:00:00.000Z'));
      const checkLimit = new CheckLimitUseCase(subscriptionRepo, usageLimitRepo);
      const result = await checkLimit.execute({ userId: 'user-1', limitType: 'transactions' });

      expect(result.currentUsage).toBe(0);
      const usage = await usageLimitRepo.findByUserId('user-1');
      expect(usage?.activeDebtsCount).toBe(2);
    });
  });

  describe('GrantPremiumUseCase', () => {
    it('grants a lifetime premium subscription with no end date', async () => {
      const useCase = new GrantPremiumUseCase(subscriptionRepo);

      const result = await useCase.execute({
        userId: 'user-1',
        grantedBy: 'admin-1',
        isLifetime: true,
        grantNote: 'Beta tester',
      });

      expect(result.tier).toBe('premium');
      expect(result.source).toBe('lifetime');
      expect(result.endDate).toBeNull();
      expect(result.priceStars).toBe(0);
      expect(result.grantedBy).toBe('admin-1');
      expect(result.grantNote).toBe('Beta tester');
    });

    it('grants a time-limited gift subscription defaulting to 30 days', async () => {
      const useCase = new GrantPremiumUseCase(subscriptionRepo);

      const result = await useCase.execute({
        userId: 'user-1',
        grantedBy: 'admin-1',
        isLifetime: false,
      });

      expect(result.source).toBe('gift');
      expect(result.endDate).toEqual(new Date(result.startDate.getTime() + 30 * DAY_MS));
    });

    it('grants a gift subscription honoring a custom duration', async () => {
      const useCase = new GrantPremiumUseCase(subscriptionRepo);

      const result = await useCase.execute({
        userId: 'user-1',
        grantedBy: 'admin-1',
        isLifetime: false,
        durationDays: 7,
      });

      expect(result.endDate).toEqual(new Date(result.startDate.getTime() + 7 * DAY_MS));
    });

    it('expires an existing active subscription before granting a new one', async () => {
      const createUseCase = new CreateSubscriptionUseCase(subscriptionRepo);
      const original = await createUseCase.execute({ userId: 'user-1', tier: 'premium', source: 'payment' });

      const useCase = new GrantPremiumUseCase(subscriptionRepo);
      await useCase.execute({ userId: 'user-1', grantedBy: 'admin-1', isLifetime: true });

      const previous = await subscriptionRepo.findById(original.id);
      expect(previous?.status).toBe('expired');
      const active = await subscriptionRepo.findActiveByUserId('user-1');
      expect(active?.source).toBe('lifetime');
    });
  });

  describe('CreateSubscriptionUseCase', () => {
    it('marks an active trial as expired when the user pays', async () => {
      const trial = new StartTrialUseCase(subscriptionRepo);
      const trialSub = await trial.execute({ userId: 'user-1' });

      const createUseCase = new CreateSubscriptionUseCase(subscriptionRepo);
      await createUseCase.execute({ userId: 'user-1', tier: 'premium', source: 'payment' });

      const previous = await subscriptionRepo.findById(trialSub!.id);
      expect(previous?.status).toBe('expired');
    });

    it('replaces an existing active payment subscription with a new one', async () => {
      const createUseCase = new CreateSubscriptionUseCase(subscriptionRepo);
      const first = await createUseCase.execute({ userId: 'user-1', tier: 'premium', source: 'payment' });

      const second = await createUseCase.execute({ userId: 'user-1', tier: 'premium', source: 'payment' });

      const previous = await subscriptionRepo.findById(first.id);
      expect(previous?.status).toBe('expired');
      expect(second.id).not.toBe(first.id);
      expect(second.status).toBe('active');
    });

    it('uses the default price and auto-renew=true for a payment subscription', async () => {
      const createUseCase = new CreateSubscriptionUseCase(subscriptionRepo);

      const result = await createUseCase.execute({ userId: 'user-1', tier: 'premium', source: 'payment' });

      expect(result.priceStars).toBe(SUBSCRIPTION_PRICE_STARS);
      expect(result.autoRenew).toBe(true);
      expect(result.endDate).toEqual(new Date(result.startDate.getTime() + MONTHLY_DURATION_DAYS * DAY_MS));
    });
  });

  describe('GetSubscriptionUseCase', () => {
    it('reports free-tier limits and no trial/premium flags for a user with no subscription', async () => {
      const useCase = new GetSubscriptionUseCase(subscriptionRepo, usageLimitRepo);

      const status = await useCase.execute('user-1');

      expect(status.subscription).toBeNull();
      expect(status.isPremium).toBe(false);
      expect(status.isTrialActive).toBe(false);
      expect(status.trialDaysLeft).toBeNull();
      expect(status.subscriptionDaysLeft).toBeNull();
      expect(status.limits.transactions.limit).toBe(FREE_TIER_LIMITS.transactions);
      expect(status.limits.transactions.remaining).toBe(FREE_TIER_LIMITS.transactions);
    });

    it('reports trial state with a deterministic days-left countdown', async () => {
      const trial = new StartTrialUseCase(subscriptionRepo);
      await trial.execute({ userId: 'user-1' });
      // Advance 4 days into the 14-day trial.
      jest.setSystemTime(new Date('2026-07-23T12:00:00.000Z'));

      const useCase = new GetSubscriptionUseCase(subscriptionRepo, usageLimitRepo);
      const status = await useCase.execute('user-1');

      expect(status.isPremium).toBe(true);
      expect(status.isTrialActive).toBe(true);
      expect(status.trialDaysLeft).toBe(10);
      expect(status.subscriptionDaysLeft).toBe(10);
      expect(status.limits.transactions.limit).toBeNull();
      expect(status.limits.transactions.remaining).toBeNull();
    });

    it('reports zero days left once the trial end date has passed', async () => {
      const trial = new StartTrialUseCase(subscriptionRepo);
      await trial.execute({ userId: 'user-1' });
      jest.setSystemTime(new Date('2026-08-05T12:00:00.000Z'));

      const useCase = new GetSubscriptionUseCase(subscriptionRepo, usageLimitRepo);
      const status = await useCase.execute('user-1');

      // Subscription is no longer "active" in findActiveByUserId's eyes because
      // isSubscriptionActive would say expired, but the fake repo still returns
      // it since status stays 'active' until markAsExpired runs. This exercises
      // isSubscriptionActive's endDate check inside isPremium/isTrialActive.
      expect(status.isPremium).toBe(false);
      expect(status.isTrialActive).toBe(false);
      expect(status.trialDaysLeft).toBe(0);
    });

    it('reports null days-left for a lifetime subscription', async () => {
      const grant = new GrantPremiumUseCase(subscriptionRepo);
      await grant.execute({ userId: 'user-1', grantedBy: 'admin-1', isLifetime: true });

      const useCase = new GetSubscriptionUseCase(subscriptionRepo, usageLimitRepo);
      const status = await useCase.execute('user-1');

      expect(status.isPremium).toBe(true);
      expect(status.subscriptionDaysLeft).toBeNull();
    });
  });

  describe('CancelSubscriptionUseCase', () => {
    it('cancels an active paid subscription and disables auto-renew', async () => {
      const createUseCase = new CreateSubscriptionUseCase(subscriptionRepo);
      await createUseCase.execute({ userId: 'user-1', tier: 'premium', source: 'payment' });

      const useCase = new CancelSubscriptionUseCase(subscriptionRepo);
      const result = await useCase.execute({ userId: 'user-1', reason: 'too expensive' });

      expect(result.success).toBe(true);
      expect(result.subscription?.status).toBe('cancelled');
      expect(result.subscription?.autoRenew).toBe(false);
      expect(result.subscription?.cancellationReason).toBe('too expensive');
      expect(result.subscription?.cancelledAt).toEqual(new Date('2026-07-19T12:00:00.000Z'));
    });

    it('refuses to cancel when the user has no active subscription', async () => {
      const useCase = new CancelSubscriptionUseCase(subscriptionRepo);

      const result = await useCase.execute({ userId: 'user-1' });

      expect(result.success).toBe(false);
      expect(result.subscription).toBeNull();
      expect(result.message).toContain('не найдена');
    });

    it('refuses to cancel a lifetime subscription', async () => {
      const grant = new GrantPremiumUseCase(subscriptionRepo);
      await grant.execute({ userId: 'user-1', grantedBy: 'admin-1', isLifetime: true });

      const useCase = new CancelSubscriptionUseCase(subscriptionRepo);
      const result = await useCase.execute({ userId: 'user-1' });

      expect(result.success).toBe(false);
      expect(result.subscription?.status).toBe('active');
      expect(result.message).toContain('нельзя отменить');
    });

    it('refuses to cancel a gifted subscription', async () => {
      const grant = new GrantPremiumUseCase(subscriptionRepo);
      await grant.execute({ userId: 'user-1', grantedBy: 'admin-1', isLifetime: false });

      const useCase = new CancelSubscriptionUseCase(subscriptionRepo);
      const result = await useCase.execute({ userId: 'user-1' });

      expect(result.success).toBe(false);
      expect(result.subscription?.status).toBe('active');
      expect(result.message).toContain('нельзя отменить');
    });
  });

  describe('SubscriptionService', () => {
    it('isPremium reflects an active premium subscription', async () => {
      const createUseCase = new CreateSubscriptionUseCase(subscriptionRepo);
      await createUseCase.execute({ userId: 'user-1', tier: 'premium', source: 'payment' });
      const service = new SubscriptionService(subscriptionRepo, usageLimitRepo);

      expect(await service.isPremium('user-1')).toBe(true);
      expect(await service.isPremium('user-2')).toBe(false);
    });

    it('canPerformAction blocks a free user once the limit is exhausted', async () => {
      const service = new SubscriptionService(subscriptionRepo, usageLimitRepo);
      for (let i = 0; i < FREE_TIER_LIMITS.voiceInputs; i++) {
        await usageLimitRepo.incrementCounter('user-1', 'voice_inputs');
      }

      expect(await service.canPerformAction('user-1', 'voice_inputs')).toBe(false);
    });

    it('getRemainingUsage returns null (unlimited) for premium and a number for free users', async () => {
      const createUseCase = new CreateSubscriptionUseCase(subscriptionRepo);
      await createUseCase.execute({ userId: 'premium-user', tier: 'premium', source: 'payment' });
      const service = new SubscriptionService(subscriptionRepo, usageLimitRepo);

      expect(await service.getRemainingUsage('premium-user', 'transactions')).toBeNull();
      expect(await service.getRemainingUsage('free-user', 'transactions')).toBe(FREE_TIER_LIMITS.transactions);
    });

    it('processExpiredSubscriptions marks all expired-but-active subscriptions as expired', async () => {
      const createUseCase = new CreateSubscriptionUseCase(subscriptionRepo);
      const sub = await createUseCase.execute({
        userId: 'user-1',
        tier: 'premium',
        source: 'payment',
        durationDays: 1,
      });
      jest.setSystemTime(new Date(sub.startDate.getTime() + 2 * DAY_MS));
      const service = new SubscriptionService(subscriptionRepo, usageLimitRepo);

      const processed = await service.processExpiredSubscriptions();

      expect(processed).toBe(1);
      const updated = await subscriptionRepo.findById(sub.id);
      expect(updated?.status).toBe('expired');
    });
  });
});
