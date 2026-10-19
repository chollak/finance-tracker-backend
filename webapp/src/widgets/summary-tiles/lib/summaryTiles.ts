import type { PeriodTotals } from '@/entities/transaction';
import { monthNameLower } from '@/shared/lib/dates';
import { formatMinor } from '@/shared/lib/money';

export interface SummaryTile {
  kind: 'income' | 'expense';
  /** «Доход за октябрь». */
  label: string;
  /** «+16 295 000», «−7 684 400», «0»; null while the totals load. */
  value: string | null;
  ariaLabel: string;
}

/**
 * The two tiles under the balance (docs/pastel/components/SummaryTiles.md): income and real expenses of
 * the month, as the backend's one totals service counts them (FT-103) — dollars at the rate, transfers and
 * records awaiting review left out. In сум, with a sign, without the unit.
 */
export function summaryTiles(totals: PeriodTotals | undefined, month: number): [SummaryTile, SummaryTile] {
  const monthName = monthNameLower(month);
  const tile = (kind: SummaryTile['kind'], minor: number | undefined): SummaryTile => {
    const label = `${kind === 'income' ? 'Доход' : 'Расход'} за ${monthName}`;
    if (minor === undefined) return { kind, label, value: null, ariaLabel: `${label}. Открыть аналитику` };
    const signed = kind === 'income' ? minor : -minor;
    return {
      kind,
      label,
      value: formatMinor(signed, 'UZS', { sign: 'always', unit: false }),
      ariaLabel: `${label}: ${minor === 0 ? 'пока нет' : formatMinor(signed, 'UZS', { sign: 'always' })}. Открыть аналитику`,
    };
  };
  return [tile('income', totals?.incomeMinor), tile('expense', totals?.expenseMinor)];
}

/**
 * A tile's amount never wraps or gets cut (SummaryTiles.md): past 14 signs it gets smaller. Half of a
 * 390px screen fits «+1 629 500 000» at 19px.
 */
export function tileValueClass(value: string): string {
  if (value.length <= 14) return 'type-tile-value';
  if (value.length <= 17) return 'text-[16px] leading-[1.2] font-extrabold tracking-[-0.3px] tabular-nums';
  return 'text-[14px] leading-[1.2] font-extrabold tracking-[-0.2px] tabular-nums';
}
