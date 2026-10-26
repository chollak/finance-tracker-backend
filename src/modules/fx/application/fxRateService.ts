import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { BusinessLogicError, ValidationError } from '../../../shared/domain/errors/AppError';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { isValidDateOnly, todayDateOnly } from '../../../shared/domain/dates/dateOnly';
import { EffectiveRate, EffectiveRateProvider } from '../../account/domain/fxRate';
import { CbuRate, MAX_RATE_MINOR, MIN_RATE_MINOR, isPlausibleRateMinor } from '../domain/fxRate';
import { FxRateRepository } from '../domain/fxRateRepository';
import { CbuClient } from '../domain/cbuClient';

const logger = getLogger(LogCategory.SYSTEM);
const REFRESH_EVERY_MS = 60 * 60 * 1000;

/** The user's own rate, kept in user settings (FT-098). */
export interface OwnRateStore {
  get(userId: string): Promise<{ rateMinor: number; since: string } | null>;
  set(userId: string, rate: { rateMinor: number; since: string } | null): Promise<void>;
}

export interface UsdRateInfo {
  /** The rate that applies to the user, or null before any rate is known. */
  effective: EffectiveRate | null;
  cbu: { rateMinor: number; date: string; fetchedAt: string } | null;
  own: { rateMinor: number; since: string } | null;
}

/**
 * USD rates (FT-102): the Central Bank rate is loaded at start and once a day; without an answer the
 * last known rate stays in force and its date is shown. A user's own rate, when set, applies instead.
 */
export class FxRateService implements EffectiveRateProvider {
  private timer?: NodeJS.Timeout;

  constructor(private repository: FxRateRepository, private client: CbuClient, private ownRates: OwnRateStore) {}

  /** Load today's CBU rate unless it is already stored; returns the latest known rate either way. */
  async refreshUsd(today: string = todayDateOnly()): Promise<CbuRate | null> {
    if (!(await this.repository.findByDate(today))) {
      await this.loadFromCbu(today);
    }
    return this.repository.latest();
  }

  /**
   * The CBU rate for a date — for an exchange on that date (FT-104). Loaded if missing; without an
   * answer, the last rate known before that date.
   */
  async cbuRateOn(date: string): Promise<CbuRate | null> {
    const stored = await this.repository.findByDate(date);
    if (stored) return stored;
    const loaded = await this.loadFromCbu(date);
    return loaded ?? this.repository.latest(date);
  }

  async effectiveUsdRate(userId: string): Promise<EffectiveRate | null> {
    const own = await this.ownRates.get(userId);
    if (own) return { rateMinor: own.rateMinor, source: 'own', date: own.since };
    const cbu = await this.repository.latest();
    return cbu ? { rateMinor: cbu.rateMinor, source: 'cbu', date: cbu.date } : null;
  }

  async info(userId: string): Promise<UsdRateInfo> {
    const [own, cbu] = await Promise.all([this.ownRates.get(userId), this.repository.latest()]);
    return {
      effective: own
        ? { rateMinor: own.rateMinor, source: 'own', date: own.since }
        : cbu ? { rateMinor: cbu.rateMinor, source: 'cbu', date: cbu.date } : null,
      cbu: cbu ? { rateMinor: cbu.rateMinor, date: cbu.date, fetchedAt: cbu.fetchedAt } : null,
      own,
    };
  }

  /**
   * Set the user's own rate from today, or go back to the CBU rate with `null`. `since` brings back an own rate
   * with the date it applied from — «Отменить» after a change of the rate (FT-119); never later than today.
   */
  async setOwnRate(
    userId: string,
    rateMinor: unknown,
    today: string = todayDateOnly(),
    since?: unknown
  ): Promise<Result<UsdRateInfo>> {
    if (rateMinor !== null && !isPlausibleRateMinor(rateMinor)) {
      return ResultHelper.failure(new ValidationError(
        `rateMinor must be an integer from ${MIN_RATE_MINOR} to ${MAX_RATE_MINOR} (сум×100 per dollar)`,
        'rateMinor'
      ));
    }
    if (since !== undefined && (!isValidDateOnly(since) || since > today)) {
      return ResultHelper.failure(new ValidationError('since must be a date YYYY-MM-DD not later than today', 'since'));
    }
    try {
      await this.ownRates.set(userId, rateMinor === null ? null : { rateMinor, since: since ?? today });
      return ResultHelper.success(await this.info(userId));
    } catch (error) {
      logger.error('Failed to set own rate', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to set own rate'));
    }
  }

  /** Refresh now and then every hour until today's rate is in; timers never keep the process alive. */
  startDailyRefresh(): void {
    const run = () => {
      this.refreshUsd().catch(error => logger.error('USD rate refresh failed', error as Error));
    };
    run();
    this.timer = setInterval(run, REFRESH_EVERY_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async loadFromCbu(date: string): Promise<CbuRate | null> {
    const fetched = await this.client.fetchUsdRate(date);
    if (!fetched) return null;
    const rate: CbuRate = { date: fetched.date, currency: 'USD', rateMinor: fetched.rateMinor, source: 'cbu', fetchedAt: new Date().toISOString() };
    await this.repository.upsert(rate);
    // On a holiday the CBU answers with the last working day's rate; keep it for the asked date too
    if (fetched.date !== date) await this.repository.upsert({ ...rate, date });
    return { ...rate, date };
  }
}
