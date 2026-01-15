import { Progress } from '@/shared/ui/progress';
import type { BudgetViewModel } from '../model/types';

interface BudgetProgressProps {
  budget: BudgetViewModel;
  showDetails?: boolean;
}

/**
 * Compact budget progress component (for lists/summaries)
 * Uses ViewModel - no formatting logic in UI!
 */
export function BudgetProgress({ budget, showDetails = true }: BudgetProgressProps) {
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{budget.name}</p>
          {showDetails && (
            <p className="text-sm text-muted-foreground">
              {budget._periodText} • {budget._daysRemainingText}
            </p>
          )}
        </div>
        <span className={`text-sm font-medium ml-2 ${budget._statusColor}`}>
          {budget._percentageText}
        </span>
      </div>

      {/* Progress Bar */}
      <Progress
        value={Math.min(budget.percentageUsed, 100)}
        className="h-2"
        indicatorClassName={budget._progressColor}
      />

      {/* Details */}
      {showDetails && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Потрачено: {budget._formattedSpent}</span>
          <span>Лимит: {budget._formattedAmount}</span>
        </div>
      )}
    </div>
  );
}
