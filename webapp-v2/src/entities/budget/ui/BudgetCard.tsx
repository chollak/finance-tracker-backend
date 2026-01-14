import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/shared/ui/card';
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
    <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={onClick}>
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

          <div className="relative w-full h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full transition-all ${budget._progressColor}`}
              style={{ width: `${Math.min(budget.percentageUsed, 100)}%` }}
            />
          </div>
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

        {/* Days Remaining */}
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            {budget._daysRemainingText}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
