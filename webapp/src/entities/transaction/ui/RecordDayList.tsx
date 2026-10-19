import { cn } from '@/shared/lib/utils';
import { CategoryDot } from '@/shared/ui/pastel';
import type { RecordDay } from '../lib/recordDays';

interface RecordDayListProps {
  days: RecordDay[];
  /** Opens the record. */
  onOpen: (id: string) => void;
  className?: string;
}

/**
 * Records grouped by day (docs/pastel/components/TransactionList.md): the day label, then a card with
 * 60px rows and no dividers — the category circle, the category and the note, the amount (expenses ink
 * with «−», income green with «+»). A long note is cut with an ellipsis, the amount never.
 *
 * The whole row opens the record. The circle as a button of its own, straight to the category picker,
 * comes with the record sheet (FT-115).
 */
export function RecordDayList({ days, onOpen, className }: RecordDayListProps) {
  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      {days.map((day) => (
        <div key={day.day} className="flex flex-col gap-1.5">
          <h3 className="type-label text-ink-muted">{day.label}</h3>
          <ul className="rounded-card bg-card px-2 py-1">
            {day.rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => row.id && onOpen(row.id)}
                  aria-label={row.ariaLabel}
                  className={cn(
                    'flex min-h-row w-full items-center rounded-control text-left text-ink',
                    'transition-colors duration-150 active:bg-track',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink'
                  )}
                >
                  <span aria-hidden="true" className="flex h-row w-[52px] shrink-0 items-center justify-center pl-1">
                    <CategoryDot name={row.title} color={row.color} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-px py-2.5 pl-2 pr-3">
                    <span className="type-body-strong truncate">{row.title}</span>
                    <span className="truncate text-[13px] leading-snug text-ink-muted">{row.note}</span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 whitespace-nowrap pr-2 text-[15px] font-extrabold tabular-nums',
                      row.tone === 'income' ? 'text-income' : 'text-ink'
                    )}
                  >
                    {row.amount}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
