import { Card } from '@/shared/ui/card';
import type { TransactionViewModel } from '../model/types';

interface TransactionCardProps {
  transaction: TransactionViewModel;
  onClick?: () => void;
}

/**
 * Transaction card component
 * Uses ViewModel with pre-formatted fields - no logic in UI!
 */
export function TransactionCard({ transaction, onClick }: TransactionCardProps) {
  return (
    <Card
      className="cursor-pointer hover:bg-accent/50 transition-colors p-4"
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Category Icon */}
          <div
            className={`flex items-center justify-center w-10 h-10 rounded-full ${transaction._categoryColor}`}
          >
            <span className="text-xl">{transaction._categoryIcon}</span>
          </div>

          {/* Transaction Details */}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground truncate">
              {transaction.description}
            </p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{transaction._formattedDate}</span>
              <span>•</span>
              <span>{transaction.category}</span>
            </div>
          </div>
        </div>

        {/* Amount */}
        <div className="text-right">
          <p className={`font-semibold text-lg ${transaction._amountColor}`}>
            {transaction._formattedAmount}
          </p>
          <p className="text-xs text-muted-foreground">
            {transaction._typeLabel}
          </p>
        </div>
      </div>
    </Card>
  );
}
