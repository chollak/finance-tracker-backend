import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Progress } from '@/shared/ui/progress';
import { budgetsToTotals } from '@/entities/budget';
import type { BudgetSummary } from '@/shared/types';

interface BudgetTotalsProps {
  budgets: BudgetSummary[];
}

/**
 * Aggregate summary across all budgets.
 * Deliberately shows no per-budget rows: on /budgets the list below already
 * shows every budget once, so this card only carries the totals (FT-055).
 */
export function BudgetTotals({ budgets }: BudgetTotalsProps) {
  const totals = budgetsToTotals(budgets);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Итого по бюджетам</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className={`text-2xl font-bold tracking-tight ${totals._remainingColor}`}>
          {totals._remainingLabel} {totals._remainingAmountText}
        </p>

        <div className="space-y-2">
          <Progress
            value={Math.min(totals.percentageUsed, 100)}
            className="h-2"
            indicatorClassName={totals._progressColor}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {totals._formattedSpent} / {totals._formattedAmount}
            </span>
            <span>{totals._percentageText}</span>
          </div>
        </div>

        <p className={`text-xs ${totals._attentionColor}`}>{totals._attentionText}</p>
      </CardContent>
    </Card>
  );
}
