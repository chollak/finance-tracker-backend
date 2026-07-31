import type { MouseEvent } from 'react';
import type { TransactionViewModel, TransactionSemanticType } from '../model/types';
import { useUpdateTransaction } from '../api/mutations';
import { NEEDS_REVIEW_CORRECTION_TYPES, getSemanticTypeLabel } from '../lib/semanticType';

interface TransactionCorrectionChipsProps {
  transaction: TransactionViewModel;
  className?: string;
}

/**
 * One-tap correction chips for a transaction awaiting review.
 * Caller controls layout/visibility — render only while transaction._needsReview is true.
 */
export function TransactionCorrectionChips({ transaction, className = '' }: TransactionCorrectionChipsProps) {
  const updateTransaction = useUpdateTransaction();

  const handleCorrect = (e: MouseEvent, semanticType: TransactionSemanticType) => {
    e.stopPropagation();
    if (!transaction.id || !transaction.userId) return;
    updateTransaction.mutate({
      id: transaction.id,
      userId: transaction.userId,
      data: { semanticType, needsReview: false },
    });
  };

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
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
  );
}
