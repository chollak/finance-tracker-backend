import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { Progress } from '@/shared/ui/progress';
import type { DebtViewModel } from '../model/types';

interface DebtCardProps {
  debt: DebtViewModel;
  onClick?: () => void;
  className?: string;
}

/**
 * Card component for displaying a debt
 */
export function DebtCard({ debt, onClick, className }: DebtCardProps) {
  return (
    <Card
      className={cn(
        'p-4 cursor-pointer transition-all hover:shadow-md',
        debt._isOverdue && 'border-red-200 bg-red-50/50',
        className
      )}
      onClick={onClick}
    >
      {/* Header: Person name + Type icon */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{debt._typeIcon}</span>
          <div>
            <h3 className="font-semibold text-lg">{debt.personName}</h3>
            <span className="text-sm text-muted-foreground">{debt._typeLabel}</span>
          </div>
        </div>
        <span className={cn('text-sm px-2 py-1 rounded-full', debt._statusColor, 'bg-current/10')}>
          {debt._statusLabel}
        </span>
      </div>

      {/* Amount */}
      <div className="mb-3">
        <div className="flex items-baseline gap-2">
          <span className={cn('text-2xl font-bold', debt._amountColor)}>
            {debt._formattedRemainingAmount}
          </span>
          {debt.remainingAmount !== debt.originalAmount && (
            <span className="text-sm text-muted-foreground line-through">
              {debt._formattedOriginalAmount}
            </span>
          )}
        </div>
        {debt.description && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
            {debt.description}
          </p>
        )}
      </div>

      {/* Progress bar (if partially paid) */}
      {debt._progressPercent > 0 && debt._progressPercent < 100 && (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Погашено {debt._formattedPaidAmount}</span>
            <span>{debt._progressPercent}%</span>
          </div>
          <Progress value={debt._progressPercent} className="h-2" />
        </div>
      )}

      {/* Footer: Date info */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Создан: {debt._formattedDate}</span>
        {debt.dueDate && (
          <span className={cn(debt._isOverdue && 'text-red-600 font-medium')}>
            {debt._isOverdue ? 'Просрочено' : `До: ${debt._formattedDueDate}`}
          </span>
        )}
      </div>
    </Card>
  );
}
