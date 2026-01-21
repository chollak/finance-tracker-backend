import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/shared/ui/tooltip';
import type { TransactionViewModel } from '../model/types';
import { TransactionActions } from './TransactionActions';
import { parseISO, format } from 'date-fns';
import { getCategoryName } from '@/entities/category/model/categories';

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
  // Use createdAt for actual time, fallback to date (which shows 00:00 for date-only)
  const time = transaction.createdAt
    ? format(parseISO(transaction.createdAt), 'HH:mm')
    : format(parseISO(transaction.date), 'HH:mm');

  return (
    <div
      className={`group flex items-center gap-3 p-3 rounded-lg list-item-transition ${
        isClickable ? 'cursor-pointer active:scale-[0.99]' : ''
      }`}
      onClick={onClick}
    >
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
        <p className="text-sm text-muted-foreground">{getCategoryName(transaction.category)}</p>
      </div>

      {/* Amount & Time */}
      <div className="flex-shrink-0 text-right">
        <p className={`font-semibold ${transaction._amountColor || 'text-foreground'}`}>
          {transaction._formattedAmount}
        </p>
        <p className="text-xs text-muted-foreground">{time}</p>
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
  );
}
