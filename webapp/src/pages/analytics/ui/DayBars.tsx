import type { MouseEvent } from 'react';
import { cn } from '@/shared/lib/utils';
import type { DayChart } from '../model/categoryScreen';
import { Chevron, FOCUS } from './parts';

/**
 * DayBars.md: spending of a category by day. The 112px area is one button — a touch chooses the nearest day, the
 * same day again clears it, Enter chooses the largest; the arrows step a day and stay focusable at the edges
 * (`aria-disabled`); the readout under the bars is `aria-live`.
 */
export function DayBarsView({
  chart,
  onTap,
  onStep,
}: {
  chart: DayChart;
  /** Where across the bars the touch was (0–1); null for Enter. */
  onTap: (fraction: number | null) => void;
  onStep: (direction: -1 | 1) => void;
}) {
  const tap = (event: MouseEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    // A click made by a key has no position (`detail` 0)
    onTap(event.detail !== 0 && box.width > 0 ? (event.clientX - box.left) / box.width : null);
  };
  const arrow = (direction: -1 | 1, edge: boolean, label: string) => (
    <button
      type="button"
      onClick={() => !edge && onStep(direction)}
      aria-disabled={edge}
      aria-label={label}
      className={cn('flex size-touch shrink-0 items-center justify-center rounded-pill bg-track text-ink', edge && 'opacity-35', FOCUS)}
    >
      <Chevron to={direction < 0 ? 'left' : 'right'} size={16} />
    </button>
  );

  return (
    <section aria-label="По дням" className="flex flex-col gap-2 rounded-card bg-card px-4 pb-2.5 pt-3.5">
      <h2 className="text-[15px] font-extrabold leading-snug">По дням</h2>
      <button type="button" onClick={tap} aria-label={chart.ariaLabel} className={cn('flex h-28 items-end border-b border-line', FOCUS)}>
        {chart.columns.map((column) => (
          <span
            key={column.date}
            aria-hidden="true"
            className={cn('flex h-28 min-w-0 flex-1 items-end justify-center rounded-t-[4px]', column.selected && 'bg-track')}
          >
            <span
              className={cn(chart.narrow ? 'w-1.5 rounded-t-[3px]' : 'w-3.5 rounded-t-[4px]', column.dim ? 'bg-chart-dim' : 'bg-ink')}
              style={{ height: column.heightPx }}
            />
          </span>
        ))}
      </button>
      <div aria-hidden="true" className="-mt-1 flex">
        {chart.columns.map((column) => (
          <span
            key={column.date}
            className={cn(
              // The axis style (12px/600, `muted`; the chosen day `ink`/800) at the board's line height
              'min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[12px] leading-snug tabular-nums',
              column.selected ? 'font-extrabold text-ink' : 'font-semibold text-ink-muted'
            )}
          >
            {column.label ?? ''}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-1">
        {arrow(-1, chart.atFirst, 'Предыдущий день')}
        <div aria-live="polite" className="flex min-w-0 flex-1 flex-col items-center gap-px text-center">
          <span className="type-label text-ink-muted">{chart.readout.top}</span>
          {chart.readout.value && <span className="text-[15px] font-extrabold tabular-nums text-ink">{chart.readout.value}</span>}
        </div>
        {arrow(1, chart.atLast, 'Следующий день')}
      </div>
    </section>
  );
}
