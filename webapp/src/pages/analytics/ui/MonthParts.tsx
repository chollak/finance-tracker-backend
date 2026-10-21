import { Link } from 'react-router-dom';
import { cn } from '@/shared/lib/utils';
import { CategoryDot } from '@/shared/ui/pastel';
import type { MonthStepper, OverviewHero, OverviewRow } from '../model/monthOverview';
import { Chevron, FOCUS, FOCUS_INSET } from './parts';

/**
 * MonthStepper.md: two 44px circles on `card` at the edges and the month between them, `aria-live`; at an edge the
 * button is `disabled` at 0.35.
 */
export function MonthStepperView({ stepper, onMonth }: { stepper: MonthStepper; onMonth: (month: string) => void }) {
  const step = (to: 'left' | 'right', month: string | null, label: string) => (
    <button
      type="button"
      onClick={() => month && onMonth(month)}
      disabled={!month}
      aria-label={label}
      className={cn('flex size-touch shrink-0 items-center justify-center rounded-pill bg-card text-ink disabled:opacity-35', FOCUS)}
    >
      <Chevron to={to} />
    </button>
  );
  return (
    <div className="flex items-center justify-between gap-2">
      {step('left', stepper.prev, 'Предыдущий месяц')}
      <span aria-live="polite" className="text-[16px] font-extrabold leading-snug">
        {stepper.title}
      </span>
      {step('right', stepper.next, 'Следующий месяц')}
    </div>
  );
}

/**
 * AnalyticsHero.md: a `primary` card — the period, the sum without a sign and «сум», the comparison, and under a
 * `hero-track` line the one insight.
 */
export function AnalyticsHeroView({ hero }: { hero: OverviewHero }) {
  return (
    <section aria-label={hero.label} className="flex flex-col gap-1 rounded-hero bg-primary px-5 pb-5 pt-4 text-on-primary">
      <h2 className="text-[14px] font-semibold leading-snug text-on-primary-muted">{hero.label}</h2>
      <p className="flex items-baseline gap-2">
        <span className={cn(hero.large ? 'type-balance' : 'type-balance-sm', 'whitespace-nowrap')}>{hero.amount}</span>{' '}
        <span className="text-[18px] font-semibold text-on-primary-muted">сум</span>
      </p>
      {hero.compare && <span className="type-label text-on-primary-muted">{hero.compare}</span>}
      {hero.insight && <p className="mt-2.5 border-t border-hero-track pt-3 text-[15px] font-bold leading-[1.4]">{hero.insight}</p>}
    </section>
  );
}

/**
 * CategoryBars.md: «По категориям» with the legend of the tick, a card of 60px rows — each a button that opens
 * the category: the circle, the name and the sum, a 6px bar on `track` filled `ink` with the 2×12 tick of the
 * previous period (ringed with `card`), and the change or the share in a column of at least 72px.
 */
export function CategoryBarsView({
  label,
  legend,
  rows,
  footnote,
  onOpen,
}: {
  label: string;
  legend: string | null;
  rows: OverviewRow[];
  footnote: string;
  onOpen: (categoryId: string) => void;
}) {
  return (
    <section aria-label={label} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 px-1 pt-1">
        <h2 className="type-section">По категориям</h2>
        {legend && (
          // Screen readers hear the comparison in every row instead
          <span aria-hidden="true" className="flex items-center gap-1.5 type-label text-ink-muted">
            <span className="h-3 w-0.5 rounded-[1px] bg-ink-muted" />
            {legend}
          </span>
        )}
      </div>
      <ul className="rounded-card bg-card px-2 py-1">
        {rows.map((row) => (
          <li key={row.categoryId} className="flex">
            <button
              type="button"
              onClick={() => onOpen(row.categoryId)}
              aria-label={row.ariaLabel}
              className={cn(
                'flex min-h-row min-w-0 flex-1 items-center gap-3 rounded-control px-2 py-2.5 text-left text-ink transition-colors duration-150 active:bg-track',
                FOCUS_INSET
              )}
            >
              <CategoryDot name={row.name} color={row.color} />
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="type-body-strong truncate">{row.name}</span>
                  <span className="shrink-0 whitespace-nowrap text-[15px] font-extrabold leading-[1.4] tabular-nums">{row.amount}</span>
                </span>
                <span className="flex items-center gap-2.5">
                  <span aria-hidden="true" className="relative flex h-3 flex-1 items-center">
                    <span className="absolute inset-x-0 top-[3px] h-1.5 rounded-[3px] bg-track" />
                    <span className="absolute left-0 top-[3px] h-1.5 rounded-[3px] bg-ink" style={{ width: `${row.barPercent}%` }} />
                    {row.tickPercent !== null && (
                      <span
                        className="absolute top-0 -ml-px h-3 w-0.5 rounded-[1px] bg-ink-muted ring-2 ring-card"
                        style={{ left: `${row.tickPercent}%` }}
                      />
                    )}
                  </span>
                  <span
                    className={cn(
                      'min-w-[72px] shrink-0 whitespace-nowrap text-right text-[13px] font-bold leading-[1.4] tabular-nums',
                      row.metaTone === 'ink' ? 'text-ink' : 'text-ink-muted'
                    )}
                  >
                    {row.meta}
                  </span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="px-1 text-[13px] font-medium leading-[1.45] text-ink-muted">{footnote}</p>
    </section>
  );
}

/**
 * The audit of the month shown (FT-132, board «Аналитика · прошлый месяц»): a `card` row with the title, one line and a
 * chevron, under the categories.
 */
export function AuditLinkView({ title, subtitle, to }: { title: string; subtitle: string; to: string }) {
  return (
    <Link to={to} className={cn('flex min-h-16 items-center gap-3 rounded-card bg-card py-3 pl-4 pr-3.5 text-ink', FOCUS)}>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-[15px] font-extrabold leading-snug">{title}</span>
        <span className="text-[13px] font-semibold text-ink-muted">{subtitle}</span>
      </span>
      <Chevron to="right" size={16} />
    </Link>
  );
}
