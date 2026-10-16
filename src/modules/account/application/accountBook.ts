import { randomUUID } from 'crypto';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { NotFoundError, ValidationError } from '../../../shared/domain/errors/AppError';
import { convertUsdToUzsMinor } from '../../../shared/domain/money/money';
import { todayDateOnly } from '../../../shared/domain/dates/dateOnly';
import { AccountResolutionInput, AccountResolver, ResolvedAccount } from '../../transaction/domain/accountResolver';
import { Account, AccountWithBalance, DEFAULT_ACCOUNT } from '../domain/account';
import { AccountRepository } from '../domain/accountRepository';
import { EffectiveRate, EffectiveRateProvider } from '../domain/fxRate';

/** The user's default account id from settings (FT-098), or null. */
export type DefaultAccountSource = (userId: string) => Promise<string | null>;

export interface AccountsSummary {
  accounts: AccountWithBalance[];
  /** Sum of visible accounts in сум (minor units); dollars at the effective rate, rounded to whole сум. */
  totalMinor: number;
  /** The rate dollars were converted at; null when there is no rate or no visible dollar account. */
  rate: EffectiveRate | null;
  /** True when a visible dollar account could not be counted because no rate is known yet. */
  missingRate: boolean;
}

function toResolved(account: Account): ResolvedAccount {
  return { id: account.id, name: account.name, currency: account.currency };
}

/**
 * The user's accounts (FT-101): «Карта» is created on first need, balances are computed on read
 * (money-model «Остаток счёта»), and every new record gets an account.
 */
export class AccountBook implements AccountResolver {
  private rates?: EffectiveRateProvider;

  constructor(private repository: AccountRepository, private defaultAccount?: DefaultAccountSource) {}

  /** Wired after modules are created; see createModules(). */
  setRateProvider(rates: EffectiveRateProvider): void {
    this.rates = rates;
  }

  setDefaultAccountSource(source: DefaultAccountSource): void {
    this.defaultAccount = source;
  }

  /** All of the user's accounts, hidden included; «Карта» is created for a user without any. */
  async listForUser(userId: string): Promise<Account[]> {
    const accounts = await this.repository.findByUserId(userId);
    if (accounts.length > 0) return accounts;
    await this.repository.create({
      id: randomUUID(),
      userId,
      ...DEFAULT_ACCOUNT,
      openingBalanceMinor: 0,
      openingDate: todayDateOnly(),
      isHidden: false,
      sortOrder: 10,
    });
    return this.repository.findByUserId(userId);
  }

  /** Accounts with balances, and the total of the visible ones in сум. */
  async summary(userId: string): Promise<AccountsSummary> {
    const accounts = await this.listForUser(userId);
    const changes = await this.repository.balanceChanges(userId);
    const withBalances = accounts.map(account => ({
      ...account,
      balanceMinor: account.openingBalanceMinor + (changes.get(account.id) ?? 0),
    }));

    const visible = withBalances.filter(account => !account.isHidden);
    const hasUsd = visible.some(account => account.currency === 'USD');
    const rate = hasUsd && this.rates ? await this.rates.effectiveUsdRate(userId) : null;

    let totalMinor = 0;
    for (const account of visible) {
      if (account.currency === 'UZS') totalMinor += account.balanceMinor;
      else if (rate) totalMinor += convertUsdToUzsMinor(account.balanceMinor, rate.rateMinor);
    }
    return { accounts: withBalances, totalMinor, rate, missingRate: hasUsd && !rate };
  }

  /** The account a new record is written to: the one picked, else the default from settings, else the first visible. */
  async resolveForRecord(input: AccountResolutionInput): Promise<Result<ResolvedAccount>> {
    const accounts = await this.listForUser(input.userId);

    if (input.accountId) {
      const picked = accounts.find(account => account.id === input.accountId);
      if (!picked) return ResultHelper.failure(new NotFoundError('Account', input.accountId));
      if (picked.isHidden) {
        return ResultHelper.failure(new ValidationError(`Account «${picked.name}» is hidden`, 'accountId'));
      }
      return ResultHelper.success(toResolved(picked));
    }

    const visible = accounts.filter(account => !account.isHidden);
    const defaultId = this.defaultAccount ? await this.defaultAccount(input.userId) : null;
    const chosen = visible.find(account => account.id === defaultId) ?? visible[0];
    if (!chosen) {
      return ResultHelper.failure(new ValidationError('No visible account to record into', 'accountId'));
    }
    return ResultHelper.success(toResolved(chosen));
  }

  /** Whether the id is one of the user's visible accounts — for the default account setting. */
  async isVisibleAccount(userId: string, accountId: string): Promise<boolean> {
    const accounts = await this.listForUser(userId);
    return accounts.some(account => account.id === accountId && !account.isHidden);
  }
}
