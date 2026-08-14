import { Card } from '@/shared/ui/card';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import type { TransactionViewModel } from '../model/types';
import { getCategoryName } from '@/entities/category/model/categories';
import { NEEDS_REVIEW_LABEL } from '../lib/semanticType';
import { TransactionCorrectionChips } from './TransactionCorrectionChips';

interface TransactionCardProps {
  transaction: TransactionViewModel;
  onClick?: () => void;
}

/**
 * Transaction card component
 * Uses ViewModel with pre-formatted fields - no logic in UI!
 */
export function TransactionCard({ transaction, onClick }: TransactionCardProps) {
  const [showCorrection, setShowCorrection] = useState(false);
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
              {transaction._showSemanticBadge && (
                <Badge variant={transaction._semanticTypeBadgeVariant} className="px-2 py-0 text-[11px]">
                  {transaction._semanticTypeLabel}
                </Badge>
              )}
              {transaction._isNonExpenseMovement && (
                <span className="text-xs text-muted-foreground">Не входит в расходы</span>
              )}
              {transaction._needsReview && (
                <button
                  type="button"
                  aria-expanded={showCorrection}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCorrection((open) => !open);
                  }}
                  className="inline-flex min-h-[var(--touch-target)] items-center"
                >
                  <Badge variant="warning" className="gap-1 px-2 py-0 text-[11px]">
                    {NEEDS_REVIEW_LABEL}
                    <ChevronDown
                      className={`h-3 w-3 transition-transform ${showCorrection ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </Badge>
                </button>
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

      {/* Correction chips stay behind the badge — see TransactionListItem */}
      {transaction._needsReview && showCorrection && (
        <TransactionCorrectionChips transaction={transaction} className="mt-3" />
      )}
    </Card>
  );
}
