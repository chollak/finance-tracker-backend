import { defaultRecordAccount, visibleAccounts, type Account, type AccountsOverview } from '@/entities/account';
import type { PeriodTotals } from '@/entities/transaction';
import { monthNameIn } from '@/shared/lib/dates';
import { CURRENCY_UNIT, formatMinor, uzsToUsdMinor, type Currency } from '@/shared/lib/money';
import { pluralWithCount } from '@/shared/lib/plural';
import { IN_UZS, shownCurrency, type DisplayMoney } from '@/features/display-currency';

export interface BalanceCardTotal {
  /** «Всего на 4 счетах» — the visible accounts. */
  label: string;
  /** «9 743 000» — in the currency of the large amount, so without the unit; with it when they differ. */
  value: string;
  /** For a screen reader, always with the unit: «Всего на 4 счетах: 9 743 000 сум». */
  spoken: string;
}

export interface BalanceCardModel {
  /** The name of the account shown large; «Всего на счетах» when there is no visible account. */
  title: string;
  /**
   * The balance of the default account (#367): in сум as it is, in dollars at the rate in effect. A dollar
   * account stays in dollars. Without a visible account — the total.
   */
  amount: string;
  unit: string;
  /**
   * The line under the amount. In сум: `totalMinor` of GET /api/accounts, nothing added or left out here. In
   * dollars: the dollar accounts as they are and the сум accounts at the rate in effect. Null with fewer
   * than two visible accounts: the card shows only the one.
   */
  total: BalanceCardTotal | null;
  /** Visible accounts, each in its own currency: «1 250 000 сум», «420,00 USD». */
  accounts: Array<{ id: string; name: string; value: string }>;
  /** Set when a dollar account is not in the shown total because there is no rate yet. */
  missingRateNote: string | null;
}

/**
 * The total in dollars: the visible dollar accounts as they are, the сум accounts at the rate — not the сум
 * total converted back, so dollars never take a round trip through whole сум.
 */
function totalInUsdMinor(accounts: readonly Account[], rateMinor: number): number {
  const sum = (currency: Currency) =>
    accounts.filter((account) => account.currency === currency).reduce((total, account) => total + account.balanceMinor, 0);
  return sum('USD') + uzsToUsdMinor(sum('UZS'), rateMinor);
}

interface Money {
  minor: number;
  currency: Currency;
}

/** The account's balance as the card shows it large: a сум account in the shown currency, a dollar one as it is. */
function accountMoney(account: Account, shown: Currency, rateMinor: number | null): Money {
  if (account.currency === 'UZS' && shown === 'USD') return { minor: uzsToUsdMinor(account.balanceMinor, rateMinor!), currency: 'USD' };
  return { minor: account.balanceMinor, currency: account.currency };
}

/**
 * The balance card of Home (docs/pastel/components/BalanceCard.md) from GET /api/accounts, in the currency
 * chosen with «Сум / USD» (FT-137). Large — the account new records go to (#367): the `defaultAccountId`
 * setting while that account is visible and in сум, else the first visible one in сум — the one rule of
 * `defaultRecordAccount`, as the server picks it; without an account in сум, the first visible one. The
 * accounts inside the card stay in their own currencies.
 */
export function balanceCardModel(
  overview: AccountsOverview,
  defaultAccountId: string | null,
  display: DisplayMoney = IN_UZS
): BalanceCardModel {
  const accounts = visibleAccounts(overview.accounts);
  const currency = shownCurrency(display);
  const totalMoney: Money = {
    minor: currency === 'USD' ? totalInUsdMinor(accounts, display.rateMinor!) : overview.totalMinor,
    currency,
  };
  const main = defaultRecordAccount(overview.accounts, defaultAccountId) ?? accounts[0] ?? null;
  const large = main ? accountMoney(main, currency, display.rateMinor) : totalMoney;
  const totalShown = accounts.length > 1;
  const label = `Всего на ${pluralWithCount(accounts.length, 'счёте', 'счетах', 'счетах')}`;

  return {
    title: main?.name ?? 'Всего на счетах',
    amount: formatMinor(large.minor, large.currency, { unit: false }),
    unit: CURRENCY_UNIT[large.currency],
    total: totalShown
      ? {
          label,
          value: formatMinor(totalMoney.minor, totalMoney.currency, { unit: totalMoney.currency !== large.currency }),
          spoken: `${label}: ${formatMinor(totalMoney.minor, totalMoney.currency)}`,
        }
      : null,
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      value: formatMinor(account.balanceMinor, account.currency),
    })),
    // In dollars the dollar accounts are counted as they are, so nothing is left out
    missingRateNote: totalShown && overview.missingRate && currency === 'UZS' ? 'Доллары не вошли в итог: курса пока нет' : null,
  };
}

/**
 * The large amount never wraps: a long one gets a smaller size (`balance` 46px → `balance-sm` 38px → 30px).
 * Up to 11 signs («974 300 000») fit beside «сум» on a 390px screen at 46px.
 */
export function balanceAmountClass(amount: string): string {
  if (amount.length <= 11) return 'type-balance';
  if (amount.length <= 15) return 'type-balance-sm';
  return 'text-[30px] leading-[1.05] font-bold tracking-[-1px] tabular-nums';
}

export type SpendShare =
  | { kind: 'share'; lead: string; percent: string; tail: string; barPercent: number }
  | { kind: 'hint'; text: string };

/**
 * The one line under the balance (design-system «Выводы вместо голых цифр»): «В октябре потрачено 47%
 * дохода», with a bar filled as much (full past 100%). Without income this month there is no share to
 * name, so the line says what will appear here — as on the board after the first launch.
 */
export function spendShare(totals: PeriodTotals, month: number): SpendShare {
  if (totals.incomeMinor <= 0) {
    return { kind: 'hint', text: 'Здесь появится, какую часть дохода вы потратили за месяц.' };
  }
  const percent = Math.round((totals.expenseMinor * 100) / totals.incomeMinor);
  return {
    kind: 'share',
    lead: `В ${monthNameIn(month)} потрачено`,
    percent: `${percent}%`,
    tail: 'дохода',
    barPercent: Math.min(100, Math.max(0, percent)),
  };
}
