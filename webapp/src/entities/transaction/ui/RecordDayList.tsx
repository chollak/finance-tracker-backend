import { NBSP } from '@/shared/lib/money';
import { cn } from '@/shared/lib/utils';
import { CategoryDot } from '@/shared/ui/pastel';
import { NOT_IN_BALANCE, type RecordDay, type RecordRow } from '../lib/recordDays';

interface RecordDayListProps {
  days: RecordDay[];
  /**
   * `history` (board «История»): the days are the screen's sections — headings of level 2, 16px apart — and each
   * carries its total on the right. `recent` (Home): days under the section «Последние операции». `category`
   * (analytics, FT-121): days with their totals under the section «Операции» of a category.
   */
  variant?: 'recent' | 'history' | 'category';
  /** Opens the record. */
  onOpen: (id: string) => void;
  /** The category circle as a button of its own: the choice of a category at once (FT-115). */
  onCategory?: (id: string) => void;
  /** The row just changed, ringed for 2 seconds (FT-115). */
  flashId?: string | null;
  className?: string;
}

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink';

/** The clock before «Ждёт связи» (OfflineBar.md: 13px, the caption's colour). */
function PendingClock({ className }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" aria-hidden="true" className={cn('shrink-0', className)}>
      <path
        d="M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm0-10.5V10l2.5 1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The caption of an operation the account's balance leaves out (FT-148): «Не входит в остаток» in the label's weight,
 * then the note. The mark is never cut: a mark wider than the whole caption (+30% labels on a narrow phone) wraps to
 * a second line.
 *
 * - A record's note goes beside the mark, cut with an ellipsis. With less than 56px left — room for «· » and three
 *   letters — it is not shown at all, so a lone «· …» never stands after the mark (the room is a container query).
 * - A move's direction (`stacked`) says where the money went and is not given up: it goes on its own line under the
 *   mark, cut only when it is wider than the whole caption.
 */
export function NotInBalanceCaption({ note, stacked = false }: { note: string; stacked?: boolean }) {
  const mark = (
    <span data-balance-mark="" className="max-w-full shrink-0 font-semibold">
      {NOT_IN_BALANCE}
    </span>
  );
  if (stacked) {
    return (
      <span className="flex min-w-0 flex-col text-[13px] leading-snug text-ink-muted">
        {mark}
        {note && (
          <span data-balance-note="" className="truncate">
            {note}
          </span>
        )}
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-start text-[13px] leading-snug text-ink-muted">
      {mark}
      {note && (
        <span className="@container min-w-0 flex-1">
          <span data-balance-note="" className="hidden truncate @min-[3.5rem]:block">{`${NBSP}· ${note}`}</span>
        </span>
      )}
    </span>
  );
}

function RowText({ row }: { row: RecordRow }) {
  return (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-px py-2.5 pl-2 pr-3">
        <span className="type-body-strong truncate">{row.title}</span>
        {row.notInBalance ? (
          <NotInBalanceCaption note={row.note} />
        ) : row.pending ? (
          <span
            className={cn(
              'flex min-w-0 gap-1 text-[13px] leading-snug text-ink-muted',
              row.noteWraps ? 'items-start' : 'items-center'
            )}
          >
            {/* On two lines the clock stays by the first one, where «Ждёт связи» is */}
            <PendingClock className={row.noteWraps ? 'mt-[2.5px]' : undefined} />
            <span data-pending="" className={row.noteWraps ? 'line-clamp-2' : 'truncate'}>
              {row.note}
            </span>
          </span>
        ) : (
          <span className="truncate text-[13px] leading-snug text-ink-muted">{row.note}</span>
        )}
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

interface RecordRowItemProps {
  row: RecordRow;
  onOpen: (id: string) => void;
  onCategory?: (id: string) => void;
  flashId?: string | null;
}

/**
 * One row of a day's card: an `<li>` with the category circle and the row as one button, or as two when
 * `onCategory` is given. The account screen (FT-118) puts these among its moves, in the same card.
 */
export function RecordRowItem({ row, onOpen, onCategory, flashId }: RecordRowItemProps) {
  return (
    <li className={cn('flex items-center rounded-control', flashId && row.id === flashId && 'ring-2 ring-inset ring-ink')}>
      {onCategory ? (
        <>
          <button
            type="button"
            onClick={() => row.id && onCategory(row.id)}
            aria-label={row.categoryAriaLabel}
            className={cn('flex h-row w-[52px] shrink-0 items-center justify-center rounded-control pl-1', FOCUS)}
          >
            <CategoryDot name={row.category} color={row.color} />
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
            <CategoryDot name={row.category} color={row.color} />
          </span>
          <RowText row={row} />
        </button>
      )}
    </li>
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
  // History's and a category's days are labelled in bold, 4px in from the card's edge
  const dated = history || variant === 'category';
  const Heading = history ? 'h2' : 'h3';
  // History's days are its sections (board «История»); Home's are a list inside one
  const Group = history ? 'section' : 'div';
  return (
    <div className={cn('flex flex-col', history ? 'gap-4' : 'gap-2.5', className)}>
      {days.map((day) => (
        <Group key={day.day} aria-label={history ? day.label : undefined} className="flex flex-col gap-1.5">
          <div className={cn('flex items-baseline justify-between gap-2', dated && 'px-1')}>
            <Heading className={cn('type-label min-w-0 truncate text-ink-muted', dated && 'font-bold')}>{day.label}</Heading>
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
              <RecordRowItem key={row.id} row={row} onOpen={onOpen} onCategory={onCategory} flashId={flashId} />
            ))}
          </ul>
        </Group>
      ))}
    </div>
  );
}
