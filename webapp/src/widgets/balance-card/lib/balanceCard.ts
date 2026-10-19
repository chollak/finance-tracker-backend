import { visibleAccounts, type AccountsOverview } from '@/entities/account';
import type { PeriodTotals } from '@/entities/transaction';
import { monthNameIn } from '@/shared/lib/dates';
import { CURRENCY_UNIT, formatMinor } from '@/shared/lib/money';
import { pluralWithCount } from '@/shared/lib/plural';

export interface BalanceCardModel {
  /** «9 743 000» — `totalMinor` of GET /api/accounts, nothing added or left out here. */
  total: string;
  unit: string;
  /** «3 счёта» — the visible accounts. */
  countLabel: string;
  /** Visible accounts, each in its own currency: «1 250 000 сум», «420,00 USD». */
  accounts: Array<{ id: string; name: string; value: string }>;
  /** Set when a dollar account is not in the total because there is no rate yet. */
  missingRateNote: string | null;
}

/** The balance card of Home (docs/pastel/components/BalanceCard.md) from GET /api/accounts. */
export function balanceCardModel(overview: AccountsOverview): BalanceCardModel {
  const accounts = visibleAccounts(overview.accounts);
  return {
    total: formatMinor(overview.totalMinor, 'UZS', { unit: false }),
    unit: CURRENCY_UNIT.UZS,
    countLabel: pluralWithCount(accounts.length, 'счёт', 'счёта', 'счетов'),
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      value: formatMinor(account.balanceMinor, account.currency),
    })),
    missingRateNote: overview.missingRate ? 'Доллары не вошли в итог: курса пока нет' : null,
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
