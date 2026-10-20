import { visibleAccounts, type Account, type AccountsOverview } from '@/entities/account';
import type { PeriodTotals } from '@/entities/transaction';
import { monthNameIn } from '@/shared/lib/dates';
import { CURRENCY_UNIT, formatMinor, uzsToUsdMinor, type Currency } from '@/shared/lib/money';
import { pluralWithCount } from '@/shared/lib/plural';
import { IN_UZS, shownCurrency, type DisplayMoney } from '@/features/display-currency';

export interface BalanceCardModel {
  /**
   * In сум: «9 743 000» — `totalMinor` of GET /api/accounts, nothing added or left out here. In dollars:
   * «770,20» — the dollar accounts as they are and the сум accounts at the rate in effect.
   */
  total: string;
  unit: string;
  /** «3 счёта» — the visible accounts. */
  countLabel: string;
  /** Visible accounts, each in its own currency: «1 250 000 сум», «420,00 USD». */
  accounts: Array<{ id: string; name: string; value: string }>;
  /** Set when a dollar account is not in the total because there is no rate yet. */
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

/**
 * The balance card of Home (docs/pastel/components/BalanceCard.md) from GET /api/accounts, in the currency
 * chosen with «Сум / USD» (FT-137). The accounts inside the card stay in their own currencies.
 */
export function balanceCardModel(overview: AccountsOverview, display: DisplayMoney = IN_UZS): BalanceCardModel {
  const accounts = visibleAccounts(overview.accounts);
  const currency = shownCurrency(display);
  const totalMinor = currency === 'USD' ? totalInUsdMinor(accounts, display.rateMinor!) : overview.totalMinor;
  return {
    total: formatMinor(totalMinor, currency, { unit: false }),
    unit: CURRENCY_UNIT[currency],
    countLabel: pluralWithCount(accounts.length, 'счёт', 'счёта', 'счетов'),
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      value: formatMinor(account.balanceMinor, account.currency),
    })),
    // In dollars the dollar accounts are counted as they are, so nothing is left out
    missingRateNote: overview.missingRate && currency === 'UZS' ? 'Доллары не вошли в итог: курса пока нет' : null,
  };
}

/**
 * The total never wraps: a long one gets a smaller size (`balance` 46px → `balance-sm` 38px → 30px).
 * Up to 11 signs («974 300 000») fit beside «сум» on a 390px screen at 46px.
 */
export function balanceAmountClass(total: string): string {
  if (total.length <= 11) return 'type-balance';
  if (total.length <= 15) return 'type-balance-sm';
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
