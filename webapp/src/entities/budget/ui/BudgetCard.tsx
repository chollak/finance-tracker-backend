import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/shared/ui/card';
import { Progress } from '@/shared/ui/progress';
import { Separator } from '@/shared/ui/separator';
import type { BudgetViewModel } from '../model/types';

interface BudgetCardProps {
  budget: BudgetViewModel;
  onClick?: () => void;
}

/**
 * Forecast colors. Red is reserved for a budget that is actually exceeded —
 * a projection that the limit may run out early is a warning, not a deadline.
 */
const FORECAST_COLORS: Record<'on-track' | 'risk' | 'exceeded', string> = {
  'on-track': 'text-muted-foreground',
  risk: 'text-warning font-medium',
  exceeded: 'text-expense font-medium',
};

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
        {/* Actionable headline: what the user can do right now */}
        <div>
          <p className={`text-3xl font-bold tracking-tight ${budget._remainingColor}`}>
            {budget._remainingLabel} {budget._remainingAmountText}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {budget._timeContextText}
          </p>
        </div>

        {/* Progress Bar (secondary: spent/total + percentage) */}
        <div className="space-y-2">
          <Progress
            value={Math.min(budget.percentageUsed, 100)}
            className="h-2"
            indicatorClassName={budget._progressColor}
          />

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {budget._formattedSpent} / {budget._formattedAmount}
            </span>
            <span>{budget._percentageText}</span>
          </div>
        </div>

        {/* Burn-down forecast — days remaining already live in the time context
            line above, so this row carries only the projection */}
        {budget._forecastText && (
          <>
            <Separator />
            <p className={`text-xs ${FORECAST_COLORS[budget._forecastStatus ?? 'on-track']}`}>
              {budget._forecastText}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
