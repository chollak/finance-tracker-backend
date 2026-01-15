import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/shared/ui/tooltip';
import type { TransactionViewModel } from '../model/types';

interface TransactionListItemProps {
  transaction: TransactionViewModel;
  onClick?: () => void;
}

/**
 * Compact transaction list item (for lists/tables)
 * Uses ViewModel - no formatting logic in UI!
 */
export function TransactionListItem({ transaction, onClick }: TransactionListItemProps) {
  const isLongDescription = transaction.description && transaction.description.length > 50;
  const isClickable = !!onClick;

  return (
    <div
      className={`flex items-center justify-between gap-4 py-3 px-4 transition-colors rounded-md ${
        isClickable ? 'hover:bg-accent/50 cursor-pointer' : ''
      }`}
      onClick={onClick}
    >
      {/* Icon + Details */}
      <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
        <span className="text-2xl flex-shrink-0">{transaction._categoryIcon}</span>
        <div className="flex-1 min-w-0 overflow-hidden">
          {isLongDescription ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="font-medium truncate max-w-[400px]">
                    {transaction.description}
                  </p>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[300px]">
                  <p className="text-sm">{transaction.description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <p className="font-medium truncate">{transaction.description}</p>
          )}
          <p className="text-sm text-muted-foreground">{transaction._formattedDate}</p>
        </div>
      </div>

      {/* Amount */}
      <span className={`font-semibold flex-shrink-0 ${transaction._amountColor}`}>
        {transaction._formattedAmount}
      </span>
    </div>
  );
}
