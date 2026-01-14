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
  return (
    <div
      className="flex items-center justify-between gap-4 py-3 px-4 hover:bg-accent/50 cursor-pointer transition-colors rounded-md"
      onClick={onClick}
    >
      {/* Icon + Details */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className="text-2xl">{transaction._categoryIcon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{transaction.description}</p>
          <p className="text-sm text-muted-foreground">{transaction._formattedDate}</p>
        </div>
      </div>

      {/* Amount */}
      <span className={`font-semibold ${transaction._amountColor}`}>
        {transaction._formattedAmount}
      </span>
    </div>
  );
}
