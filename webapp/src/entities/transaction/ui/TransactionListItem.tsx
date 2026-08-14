import { Badge } from '@/shared/ui/badge';
import type { TransactionViewModel } from '../model/types';
import { TransactionActions } from './TransactionActions';
import { TransactionCorrectionChips } from './TransactionCorrectionChips';
import { getCategoryName } from '@/entities/category/model/categories';
import { NEEDS_REVIEW_LABEL } from '../lib/semanticType';

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
  const isClickable = !!onClick;

  return (
    <div
      className={`group rounded-lg list-item-transition ${
        isClickable ? 'cursor-pointer active:scale-[0.99]' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 p-3">
        {/* Category Icon */}
        <div className={`flex-shrink-0 w-10 h-10 rounded-full ${transaction._categoryColor || 'bg-muted text-muted-foreground'} flex items-center justify-center`}>
          <span className="text-lg">{transaction._categoryIcon}</span>
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <p className="font-medium line-clamp-2">{transaction.description}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
            <span className="text-sm text-muted-foreground truncate">{getCategoryName(transaction.category)}</span>
            {transaction._showSemanticBadge && (
              <Badge variant={transaction._semanticTypeBadgeVariant} className="px-1.5 py-0 text-[10px]">
                {transaction._semanticTypeLabel}
              </Badge>
            )}
            {transaction._needsReview && (
              <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                {NEEDS_REVIEW_LABEL}
              </Badge>
            )}
          </div>
          {transaction._isNonExpenseMovement && (
            <p className="text-xs text-muted-foreground mt-0.5">Не входит в расходы</p>
          )}
        </div>

        {/* Amount & Time */}
        <div className="ml-2 max-w-[8.5rem] flex-shrink-0 text-right">
          <p className={`truncate font-semibold ${transaction._amountColor || 'text-foreground'}`}>
            {transaction._formattedAmount}
          </p>
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

      {/* One-tap correction chips */}
      {transaction._needsReview && (
        <TransactionCorrectionChips transaction={transaction} className="pb-3 pr-3 pl-[3.25rem]" />
      )}
    </div>
  );
}
