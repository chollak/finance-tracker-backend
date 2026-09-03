import { useState, type MouseEvent } from 'react';
import { toast } from 'sonner';
import type { TransactionViewModel, TransactionSemanticType } from '../model/types';
import { useUpdateTransaction } from '../api/mutations';
import {
  NEEDS_REVIEW_CORRECTION_TYPES,
  NEEDS_REVIEW_PROMPT,
  getSemanticTypeLabel,
} from '../lib/semanticType';
import { getCorrectionToggleLabel } from '../lib/transactionRowDisplay';

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
  const [isExpanded, setIsExpanded] = useState(false);

  const handleCorrect = async (e: MouseEvent, semanticType: TransactionSemanticType) => {
    e.stopPropagation();
    if (!transaction.id || !transaction.userId) return;
    try {
      await updateTransaction.mutateAsync({
        id: transaction.id,
        userId: transaction.userId,
        data: { semanticType, needsReview: false },
      });
      // The chip row disappears once needsReview clears, so the toast is the only
      // confirmation the user gets — it also explains why the totals shift.
      toast.success('Тип обновлён', {
        description: `${getSemanticTypeLabel(semanticType)} — итоги пересчитаются`,
      });
    } catch (error) {
      toast.error('Не удалось обновить тип');
      console.error('Failed to correct transaction semantic type:', error);
    }
  };

  return (
    // The chips usually sit inside a click-to-edit row: swallow every click that
    // lands in this block (chip, gap or prompt) so correcting never navigates away.
    <div className={className} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-end gap-2">
        {isExpanded && (
          <p className="min-w-0 flex-1 text-[11px] font-medium text-muted-foreground">{NEEDS_REVIEW_PROMPT}</p>
        )}
        <button
          type="button"
          aria-expanded={isExpanded}
          disabled={updateTransaction.isPending}
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded((current) => !current);
          }}
          className="inline-flex min-h-11 flex-shrink-0 items-center rounded-full border border-warning/30 bg-warning-muted px-3 py-1 text-xs font-semibold text-warning transition-colors hover:bg-warning-muted/80 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
        >
          {getCorrectionToggleLabel(isExpanded)}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {NEEDS_REVIEW_CORRECTION_TYPES.map((semanticType) => {
            const isCurrent = transaction.semanticType === semanticType;
            return (
              <button
                key={semanticType}
                type="button"
                aria-pressed={isCurrent}
                disabled={updateTransaction.isPending}
                onClick={(e) => void handleCorrect(e, semanticType)}
                className={`inline-flex min-h-11 items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors active:scale-95 disabled:opacity-50 disabled:pointer-events-none ${
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
      )}
    </div>
  );
}
