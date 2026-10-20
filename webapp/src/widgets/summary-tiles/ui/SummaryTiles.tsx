import { Link } from 'react-router-dom';
import { cn } from '@/shared/lib/utils';
import { ROUTES } from '@/shared/lib/constants/routes';
import { monthBounds, monthTitle, parseLocalDate, toLocalDate } from '@/shared/lib/dates';
import { SkeletonBlock } from '@/shared/ui/pastel';
import { usePeriodTotals, type PeriodTotals } from '@/entities/transaction';
import { IN_UZS, useDisplayCurrency, type DisplayMoney } from '@/features/display-currency';
import { missingRateNote, summaryTiles, tileValueClass, type SummaryTile } from '../lib/summaryTiles';

const TONE: Record<SummaryTile['kind'], string> = {
  income: 'bg-pastel-mint text-mint-ink',
  expense: 'bg-pastel-peach text-peach-ink',
};

function Tile({ tile, isError }: { tile: SummaryTile; isError: boolean }) {
  return (
    // The income tile opens the income of Analytics, the expense tile its expenses (board «Главная», FT-121)
    <Link
      to={tile.kind === 'income' ? ROUTES.ANALYTICS_VIEW({ type: 'income' }) : ROUTES.ANALYTICS}
      aria-label={tile.ariaLabel}
      className={cn(
        'flex min-w-0 flex-col gap-1.5 rounded-card p-4 transition-transform duration-150 active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        TONE[tile.kind]
      )}
    >
      <span className="flex items-center justify-between gap-1 text-[13px] font-bold">
        {tile.label}
        <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
          <path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {tile.value !== null ? (
        <span className={cn(tileValueClass(tile.value), 'whitespace-nowrap')}>{tile.value}</span>
      ) : isError ? (
        // The balance card above says the month's totals did not load and reads them again (same query)
        <span className="type-tile-value">—</span>
      ) : (
        <SkeletonBlock className="my-0.5 h-[19px] w-24 bg-pastel-ink/10" />
      )}
    </Link>
  );
}

export interface SummaryTilesViewProps {
  totals: { data: PeriodTotals | undefined; isError: boolean };
  /** The currency of the sums («Сум / USD», FT-137); сум by default. */
  display?: DisplayMoney;
  year: number;
  /** 1–12. */
  month: number;
  className?: string;
}

/** The tiles as the board draws them, from totals already read; `SummaryTiles` reads them. */
export function SummaryTilesView({ totals, display = IN_UZS, year, month, className }: SummaryTilesViewProps) {
  const [income, expense] = summaryTiles(totals.data, month, display);
  const note = missingRateNote(totals.data);
  return (
    <section aria-label={monthTitle(year, month)} className={cn('grid grid-cols-2 gap-3', className)}>
      <Tile tile={income} isError={totals.isError} />
      <Tile tile={expense} isError={totals.isError} />
      {note && <p className="col-span-2 -mt-1 px-1 text-[13px] font-medium text-ink-muted">{note}</p>}
    </section>
  );
}

/**
 * Month tiles of Home (FT-111, SummaryTiles.md): income in mint, expenses in peach, both themes alike;
 * each opens its side of Analytics. The numbers are the backend's totals service (GET /api/transactions/totals), in the
 * currency of «Сум / USD» in the header (FT-137).
 */
export function SummaryTiles({ className }: { className?: string }) {
  const today = toLocalDate(new Date());
  const { year, month } = parseLocalDate(today);
  const totals = usePeriodTotals(monthBounds(today));
  const { shown, rateMinor } = useDisplayCurrency();
  return (
    <SummaryTilesView totals={totals} display={{ currency: shown, rateMinor }} year={year} month={month} className={className} />
  );
}
