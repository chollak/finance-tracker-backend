import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { NotFoundError, ValidationError } from '../../../shared/domain/errors/AppError';
import { convertUsdToUzsMinor } from '../../../shared/domain/money/money';
import { todayDateOnly } from '../../../shared/domain/dates/dateOnly';
import { AccountResolutionInput, AccountResolver, ResolvedAccount } from '../../transaction/domain/accountResolver';
import { Account, AccountWithBalance, DEFAULT_ACCOUNT, accountNameKey, starterAccountId } from '../domain/account';
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

function toResolved(account: Account, matchedBy: ResolvedAccount['matchedBy']): ResolvedAccount {
  return { id: account.id, name: account.name, currency: account.currency, matchedBy };
}

/** Whether the account's name stands in the text as a word or phrase («с Humo», «Наличные»). */
function namedIn(text: string, account: Account): boolean {
  const name = accountNameKey(account.name);
  if (!name) return false;
  const haystack = ` ${accountNameKey(text).replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  return haystack.includes(` ${name.replace(/[^\p{L}\p{N}]+/gu, ' ')} `);
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

  /**
   * All of the user's accounts, hidden included; «Карта» is created for a user without any. Its id comes
   * from the user (`starterAccountId`), so concurrent first requests end up with one «Карта»: the
   * insert that loses the race is skipped (FT-140).
   */
  async listForUser(userId: string): Promise<Account[]> {
    const accounts = await this.repository.findByUserId(userId);
    if (accounts.length > 0) return accounts;
    await this.repository.createIfMissing({
      id: starterAccountId(userId),
      userId,
      ...DEFAULT_ACCOUNT,
      openingBalanceMinor: 0,
      openingDate: todayDateOnly(),
      isHidden: false,
      sortOrder: 10,
    });
    const created = await this.repository.findByUserId(userId);
    if (created.length === 0) throw new Error(`Starter account for user ${userId} not created`);
    return created;
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

  /**
   * The account a new record is written to (FT-101, FT-103): the one picked; else, among visible
   * accounts in the record's currency, one named in the text, then one of the kind the text names
   * («нал», «картой»), preferring the default; else the default account, else the first visible.
   * Without an account in the currency («55$» and no dollar account) the default is returned and the
   * caller sees the mismatch.
   */
  async resolveForRecord(input: AccountResolutionInput): Promise<Result<ResolvedAccount>> {
    const accounts = await this.listForUser(input.userId);

    if (input.accountId) {
      const picked = accounts.find(account => account.id === input.accountId);
      if (!picked) return ResultHelper.failure(new NotFoundError('Account', input.accountId));
      if (picked.isHidden) {
        return ResultHelper.failure(new ValidationError(`Account «${picked.name}» is hidden`, 'accountId'));
      }
      return ResultHelper.success(toResolved(picked, 'picked'));
    }

    const visible = accounts.filter(account => !account.isHidden);
    const defaultId = this.defaultAccount ? await this.defaultAccount(input.userId) : null;
    const fallback = visible.find(account => account.id === defaultId) ?? visible[0];
    if (!fallback) {
      return ResultHelper.failure(new ValidationError('No visible account to record into', 'accountId'));
    }

    const inCurrency = input.currency ? visible.filter(account => account.currency === input.currency) : visible;
    const preferDefault = (candidates: Account[]) => candidates.find(account => account.id === fallback.id) ?? candidates[0];

    const byName = input.text ? inCurrency.find(account => namedIn(input.text!, account)) : undefined;
    if (byName) return ResultHelper.success(toResolved(byName, 'name'));

    const ofKind = input.kind ? inCurrency.filter(account => account.kind === input.kind) : [];
    if (ofKind.length > 0) return ResultHelper.success(toResolved(preferDefault(ofKind), 'kind'));

    if (input.currency && inCurrency.length > 0 && !inCurrency.includes(fallback)) {
      return ResultHelper.success(toResolved(preferDefault(inCurrency), 'currency'));
    }
    return ResultHelper.success(toResolved(fallback, 'default'));
  }

  /** Whether the id is one of the user's visible accounts — for the default account setting. */
  async isVisibleAccount(userId: string, accountId: string): Promise<boolean> {
    const accounts = await this.listForUser(userId);
    return accounts.some(account => account.id === accountId && !account.isHidden);
  }
}
