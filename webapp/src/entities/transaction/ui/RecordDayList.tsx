import { cn } from '@/shared/lib/utils';
import { CategoryDot } from '@/shared/ui/pastel';
import type { RecordDay, RecordRow } from '../lib/recordDays';

interface RecordDayListProps {
  days: RecordDay[];
  /**
   * `history` (board «История»): the days are the screen's sections — headings of level 2, 16px apart — and each
   * carries its total on the right. `recent` (Home): days under the section «Последние операции».
   */
  variant?: 'recent' | 'history';
  /** Opens the record. */
  onOpen: (id: string) => void;
  /** The category circle as a button of its own: the choice of a category at once (FT-115). */
  onCategory?: (id: string) => void;
  /** The row just changed, ringed for 2 seconds (FT-115). */
  flashId?: string | null;
  className?: string;
}

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink';

function RowText({ row }: { row: RecordRow }) {
  return (
    <>
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
    </>
  );
}

/**
 * Records grouped by day (docs/pastel/components/TransactionList.md): the day label (in History with the day's
 * total on the right), then a card with 60px rows and no dividers — the category circle, the category and the
 * note, the amount (expenses ink with «−», income green with «+»). A long note is cut with an ellipsis, the
 * amount never.
 *
 * A row is two buttons when `onCategory` is given: the circle (a 52×60 target) opens the choice of a category
 * at once, the rest of the row opens the record. The row just changed is ringed inside with `ink` for 2 seconds.
 */
export function RecordDayList({ days, variant = 'recent', onOpen, onCategory, flashId, className }: RecordDayListProps) {
  const history = variant === 'history';
  const Heading = history ? 'h2' : 'h3';
  // History's days are its sections (board «История»); Home's are a list inside one
  const Group = history ? 'section' : 'div';
  return (
    <div className={cn('flex flex-col', history ? 'gap-4' : 'gap-2.5', className)}>
      {days.map((day) => (
        <Group key={day.day} aria-label={history ? day.label : undefined} className="flex flex-col gap-1.5">
          <div className={cn('flex items-baseline justify-between gap-2', history && 'px-1')}>
            <Heading className={cn('type-label min-w-0 truncate text-ink-muted', history && 'font-bold')}>{day.label}</Heading>
            {day.total && (
              <span
                className={cn(
                  'type-label shrink-0 whitespace-nowrap font-extrabold',
                  day.total.tone === 'income' ? 'text-income' : 'text-ink-muted'
                )}
              >
                <span className="sr-only">Итог дня: </span>
                {day.total.text}
              </span>
            )}
          </div>
          <ul className="rounded-card bg-card px-2 py-1">
            {day.rows.map((row) => (
              <li
                key={row.id}
                className={cn('flex items-center rounded-control', flashId && row.id === flashId && 'ring-2 ring-inset ring-ink')}
              >
                {onCategory ? (
                  <>
                    <button
                      type="button"
                      onClick={() => row.id && onCategory(row.id)}
                      aria-label={row.categoryAriaLabel}
                      className={cn('flex h-row w-[52px] shrink-0 items-center justify-center rounded-control pl-1', FOCUS)}
                    >
                      <CategoryDot name={row.title} color={row.color} />
                    </button>
                    <button
                      type="button"
                      onClick={() => row.id && onOpen(row.id)}
                      aria-label={row.ariaLabel}
                      className={cn(
                        'flex min-h-row min-w-0 flex-1 items-center rounded-control text-left text-ink',
                        'transition-colors duration-150 active:bg-track',
                        FOCUS
                      )}
                    >
                      <RowText row={row} />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => row.id && onOpen(row.id)}
                    aria-label={row.ariaLabel}
                    className={cn(
                      'flex min-h-row w-full items-center rounded-control text-left text-ink',
                      'transition-colors duration-150 active:bg-track',
                      FOCUS
                    )}
                  >
                    <span aria-hidden="true" className="flex h-row w-[52px] shrink-0 items-center justify-center pl-1">
                      <CategoryDot name={row.title} color={row.color} />
                    </span>
                    <RowText row={row} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Group>
      ))}
    </div>
  );
}
