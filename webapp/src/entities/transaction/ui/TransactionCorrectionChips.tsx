import type { MouseEvent } from 'react';
import type { TransactionViewModel, TransactionSemanticType } from '../model/types';
import { useUpdateTransaction } from '../api/mutations';
import {
  NEEDS_REVIEW_CORRECTION_TYPES,
  NEEDS_REVIEW_PROMPT,
  getSemanticTypeLabel,
} from '../lib/semanticType';

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
    // The chips usually sit inside a click-to-edit row: swallow every click that
    // lands in this block (chip, gap or prompt) so correcting never navigates away.
    <div className={className} onClick={(e) => e.stopPropagation()}>
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">{NEEDS_REVIEW_PROMPT}</p>
      <div className="flex flex-wrap gap-1.5">
        {NEEDS_REVIEW_CORRECTION_TYPES.map((semanticType) => {
          const isCurrent = transaction.semanticType === semanticType;
          return (
            <button
              key={semanticType}
              type="button"
              aria-pressed={isCurrent}
              disabled={updateTransaction.isPending}
              onClick={(e) => handleCorrect(e, semanticType)}
              className={`inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors active:scale-95 disabled:opacity-50 disabled:pointer-events-none ${
                isCurrent
                  ? 'border-warning/50 bg-warning-muted text-foreground'
                  : 'border-border bg-background text-foreground hover:bg-accent'
              }`}
            >
              {getSemanticTypeLabel(semanticType)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
