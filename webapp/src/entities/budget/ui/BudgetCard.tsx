import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/shared/ui/card';
import { Progress } from '@/shared/ui/progress';
import { Separator } from '@/shared/ui/separator';
import type { BudgetViewModel } from '../model/types';

interface BudgetCardProps {
  budget: BudgetViewModel;
  onClick?: () => void;
}

/**
 * Budget card component with progress bar
 * Uses ViewModel - no formatting logic in UI!
 */
export function BudgetCard({ budget, onClick }: BudgetCardProps) {
  return (
    <Card className="cursor-pointer card-hover" onClick={onClick}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg">{budget.name}</CardTitle>
            <CardDescription>{budget._periodText}</CardDescription>
          </div>
          <span className={`text-sm font-medium ${budget._statusColor}`}>
            {budget._statusText}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Потрачено: {budget._formattedSpent}
            </span>
            <span className="font-medium">{budget._percentageText}</span>
          </div>

          <Progress
            value={Math.min(budget.percentageUsed, 100)}
            className="h-2"
            indicatorClassName={budget._progressColor}
          />
        </div>

        {/* Budget Details */}
        <div className="flex items-center justify-between text-sm">
          <div>
            <p className="text-muted-foreground">Осталось</p>
            <p className="font-semibold text-lg">
              {budget.isOverBudget ? '0 сўм' : budget._formattedRemaining}
            </p>
          </div>

          <div className="text-right">
            <p className="text-muted-foreground">Бюджет</p>
            <p className="font-semibold text-lg">{budget._formattedAmount}</p>
          </div>
        </div>

        {/* Days Remaining & Velocity Prediction */}
        <Separator />
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {budget._daysRemainingText}
          </span>
          {budget._velocityText && (
            <span
              className={
                budget._velocityStatus === 'danger'
                  ? 'text-red-600 font-medium'
                  : budget._velocityStatus === 'warning'
                  ? 'text-orange-600 font-medium'
                  : 'text-green-600'
              }
            >
              {budget._velocityText}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
