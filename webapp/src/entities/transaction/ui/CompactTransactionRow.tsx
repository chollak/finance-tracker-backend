import type { KeyboardEvent } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { TransactionViewModel } from '../model/types';
import { TransactionActions } from './TransactionActions';
import { TransactionCorrectionChips } from './TransactionCorrectionChips';
import { NEEDS_REVIEW_LABEL } from '../lib/semanticType';
import { formatCompactRowAriaLabel, formatCompactRowMeta } from '../lib/transactionRowDisplay';

interface CompactTransactionRowProps {
  transaction: TransactionViewModel;
  onClick?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete?: () => void;
  showActions?: boolean;
  /** Injected in tests/previews; production rows read the current day. */
  now?: Date;
}

/**
 * Compact transaction row — one capture, one line (FT-080).
 *
 * This is the row for the quick-action loop: after a capture the user scans the list
 * to check that the parse is right, and everything that made the old management row
 * tall (a two-line description, a semantic badge, the «Не считается расходом» hint,
 * a dedicated review block) turns into scrolling. Here the description gets one
 * truncated line, the rest collapses into a single meta line, and the amount keeps
 * the right edge — so five rows fit where three used to.
 *
 * Semantic meaning survives the compression: `_amountColor` keeps real expenses red,
 * income green and every non-spending movement neutral grey, and the meta line names
 * that movement instead of the amount pretending to be a расход. A row awaiting a
 * correction stays a warning surface with its one-tap chips — the only affordance
 * that is allowed to add a second line, because it is the point of the list.
 *
 * `TransactionListItem` stays as it is for the History page; that page is FT-081.
 */
export function CompactTransactionRow({
  transaction,
  onClick,
  onArchive,
  onUnarchive,
  onDelete,
  showActions = false,
  now,
}: CompactTransactionRowProps) {
  const isClickable = !!onClick;
  const needsReview = transaction._needsReview;
  const meta = formatCompactRowMeta(transaction, now ?? new Date());
  const hasActions = showActions && !!(onArchive || onUnarchive || onDelete);

  // The row is the tap target, so it has to answer the keyboard too — a pointer-only
  // edit affordance would leave the list unusable without a touchscreen.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target !== event.currentTarget) return;

    event.preventDefault();
    onClick();
  };

  return (
    <div
      className={cn(
        'list-item-transition',
        needsReview && 'bg-warning-muted/60',
        isClickable &&
          'cursor-pointer active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
      )}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={isClickable ? formatCompactRowAriaLabel(transaction) : undefined}
      onClick={onClick}
      onKeyDown={handleKeyDown}
    >
      {/* 52px keeps the row above the 44px touch minimum while staying denser than the
          old two-line card row; the actions menu is 44px itself and sets the floor. */}
      <div className="flex min-h-[52px] items-center gap-3 px-2 py-2">
        {/* The category emoji alone, without the coloured disc: a column of tinted
            circles is decoration in a list whose only colour job is the amount. */}
        <span aria-hidden="true" className="w-6 shrink-0 text-center text-base leading-none">
          {transaction._categoryIcon}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-snug">{transaction.description}</p>
          {meta && (
            <p className="mt-0.5 truncate text-xs leading-snug text-muted-foreground">{meta}</p>
          )}
        </div>

        <p
          className={cn(
            'max-w-[45%] shrink-0 truncate text-right text-sm font-semibold tabular-nums',
            transaction._amountColor || 'text-foreground'
          )}
        >
          {transaction._formattedAmount}
        </p>

        {hasActions && (
          <TransactionActions
            isArchived={transaction.isArchived}
            onEdit={onClick}
            onArchive={onArchive}
            onUnarchive={onUnarchive}
            onDelete={onDelete}
          />
        )}
      </div>

      {/* Review affordance: the flag on the left, the one-tap correction on the right.
          Indented to the description column so the row still reads as one entry. */}
      {needsReview && (
        <div className="flex items-center gap-2 pb-2 pl-11 pr-2">
          <span className="inline-flex min-w-0 items-center gap-1 text-xs font-medium text-warning">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{NEEDS_REVIEW_LABEL}</span>
          </span>
          <TransactionCorrectionChips transaction={transaction} className="min-w-0 flex-1" />
        </div>
      )}
    </div>
  );
}
