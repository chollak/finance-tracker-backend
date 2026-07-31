import type { MouseEvent } from 'react';
import { Card } from '@/shared/ui/card';
import { Badge } from '@/shared/ui/badge';
import type { TransactionViewModel } from '../model/types';
import { getCategoryName } from '@/entities/category/model/categories';
import { useUpdateTransaction } from '../api/mutations';
import { NEEDS_REVIEW_LABEL, NEEDS_REVIEW_CORRECTION_TYPES, getSemanticTypeLabel } from '../lib/semanticType';

interface TransactionCardProps {
  transaction: TransactionViewModel;
  onClick?: () => void;
}

/**
 * Transaction card component
 * Uses ViewModel with pre-formatted fields - no logic in UI!
 */
export function TransactionCard({ transaction, onClick }: TransactionCardProps) {
  const updateTransaction = useUpdateTransaction();

  const handleCorrect = (e: MouseEvent, semanticType: TransactionViewModel['semanticType']) => {
    e.stopPropagation();
    if (!transaction.id || !transaction.userId) return;
    updateTransaction.mutate({
      id: transaction.id,
      userId: transaction.userId,
      data: { semanticType, needsReview: false },
    });
  };

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
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{transaction._formattedDate}</span>
              <span>•</span>
              <span>{getCategoryName(transaction.category)}</span>
              <Badge variant={transaction._semanticTypeBadgeVariant} className="px-2 py-0 text-[11px]">
                {transaction._semanticTypeLabel}
              </Badge>
              {transaction._isNonExpenseMovement && (
                <span className="text-xs text-muted-foreground">Не входит в расходы</span>
              )}
              {transaction._needsReview && (
                <Badge variant="warning" className="px-2 py-0 text-[11px]">
                  {NEEDS_REVIEW_LABEL}
                </Badge>
              )}
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

      {/* Correction chips — shown only while the transaction needs review */}
      {transaction._needsReview && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {NEEDS_REVIEW_CORRECTION_TYPES.map((semanticType) => (
            <button
              key={semanticType}
              type="button"
              disabled={updateTransaction.isPending}
              onClick={(e) => handleCorrect(e, semanticType)}
              className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-accent disabled:opacity-50 disabled:pointer-events-none transition-colors"
            >
              {getSemanticTypeLabel(semanticType)}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
