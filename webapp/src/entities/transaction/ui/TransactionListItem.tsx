import { AlertCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/shared/ui/tooltip';
import { Badge } from '@/shared/ui/badge';
import type { TransactionViewModel } from '../model/types';
import { TransactionActions } from './TransactionActions';
import { TransactionCorrectionChips } from './TransactionCorrectionChips';
import { parseISO, format } from 'date-fns';
import { getCategoryName } from '@/entities/category/model/categories';
import { NEEDS_REVIEW_LABEL, NON_EXPENSE_MOVEMENT_HINT } from '../lib/semanticType';

interface TransactionListItemProps {
  transaction: TransactionViewModel;
  onClick?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete?: () => void;
  showActions?: boolean;
}

/**
 * Compact transaction list item with integrated actions menu
 * Uses ViewModel - no formatting logic in UI!
 */
export function TransactionListItem({
  transaction,
  onClick,
  onArchive,
  onUnarchive,
  onDelete,
  showActions = true,
}: TransactionListItemProps) {
  const isLongDescription = transaction.description && transaction.description.length > 40;
  const isClickable = !!onClick;
  const needsReview = transaction._needsReview;
  // Use createdAt for actual time, fallback to date (which shows 00:00 for date-only)
  const time = transaction.createdAt
    ? format(parseISO(transaction.createdAt), 'HH:mm')
    : format(parseISO(transaction.date), 'HH:mm');

  return (
    <div
      className={`group rounded-lg border list-item-transition ${
        // Transparent border by default keeps row height identical to the flagged state.
        needsReview ? 'border-warning/40 bg-warning-muted/50' : 'border-transparent'
      } ${isClickable ? 'cursor-pointer active:scale-[0.99]' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start gap-3 p-3">
        {/* Category Icon */}
        <div className={`flex-shrink-0 w-10 h-10 rounded-full ${transaction._categoryColor || 'bg-muted text-muted-foreground'} flex items-center justify-center`}>
          <span className="text-lg">{transaction._categoryIcon}</span>
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          {isLongDescription ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="font-medium truncate">{transaction.description}</p>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[300px]">
                  <p className="text-sm">{transaction.description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <p className="font-medium truncate">{transaction.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
            <span className="text-sm text-muted-foreground truncate">{getCategoryName(transaction.category)}</span>
            <Badge
              variant={transaction._semanticTypeBadgeVariant}
              className="px-2 py-0.5 text-[11px] leading-tight"
            >
              {transaction._semanticTypeLabel}
            </Badge>
          </div>
          {needsReview && (
            <Badge variant="warning" className="mt-1.5 gap-1 px-2 py-1 text-[11px] leading-tight">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              {NEEDS_REVIEW_LABEL}
            </Badge>
          )}
          {transaction._isNonExpenseMovement && (
            <p className="mt-1 text-xs font-medium text-muted-foreground">{NON_EXPENSE_MOVEMENT_HINT}</p>
          )}
        </div>

        {/* Amount & Time */}
        <div className="ml-1 max-w-[7.5rem] flex-shrink-0 text-right">
          <p className={`truncate text-sm font-semibold tabular-nums ${transaction._amountColor || 'text-foreground'}`}>
            {transaction._formattedAmount}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">{time}</p>
        </div>

        {/* Actions Menu */}
        {showActions && (onArchive || onUnarchive || onDelete) && (
          <TransactionActions
            isArchived={transaction.isArchived}
            onEdit={onClick}
            onArchive={onArchive}
            onUnarchive={onUnarchive}
            onDelete={onDelete}
          />
        )}
      </div>

      {/* One-tap correction chips — full row width so seven chips wrap cleanly on 375px */}
      {needsReview && (
        <TransactionCorrectionChips
          transaction={transaction}
          className="border-t border-warning/30 px-3 pb-3 pt-2"
        />
      )}
    </div>
  );
}
