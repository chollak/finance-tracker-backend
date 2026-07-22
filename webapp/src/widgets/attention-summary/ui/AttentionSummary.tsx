import { AlertTriangle, AlertCircle, TrendingDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { useDashboardInsights } from '@/entities/dashboard';
import { useUserStore } from '@/entities/user/model/store';
import { getCategoryName } from '@/entities/category';
import { formatCurrency } from '@/shared/lib/formatters';
import { ROUTES } from '@/shared/lib/constants/routes';

/**
 * Attention summary widget
 * Surfaces what needs the user's attention right now: over-budget /
 * near-limit budgets and the top spending category for the period.
 * Renders nothing if there is no signal worth surfacing yet.
 */
export function AttentionSummary() {
  const userId = useUserStore((state) => state.userId);
  const { data: dashboard, isLoading } = useDashboardInsights(userId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-medium">Что важно сейчас</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  const overBudgetCount = dashboard?.insights?.budgetOverview?.overBudgetCount ?? 0;
  const budgetsNearLimit = dashboard?.insights?.budgetOverview?.budgetsNearLimit ?? 0;
  const topCategory = dashboard?.insights?.topCategories?.[0];
  const hasTopCategory = !!topCategory && topCategory.amount > 0;

  if (overBudgetCount === 0 && budgetsNearLimit === 0 && !hasTopCategory) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-medium">Что важно сейчас</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {overBudgetCount > 0 && (
          <Link
            to={ROUTES.BUDGETS}
            className="flex items-center justify-between rounded-xl bg-expense-muted px-4 py-3 transition-colors hover:bg-expense-muted/80"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-expense">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              Превышен лимит бюджета
            </span>
            <span className="text-sm font-semibold text-expense">{overBudgetCount}</span>
          </Link>
        )}

        {budgetsNearLimit > 0 && (
          <Link
            to={ROUTES.BUDGETS}
            className="flex items-center justify-between rounded-xl bg-warning-muted px-4 py-3 transition-colors hover:bg-warning-muted/80"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-warning">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              Близко к лимиту бюджета
            </span>
            <span className="text-sm font-semibold text-warning">{budgetsNearLimit}</span>
          </Link>
        )}

        {hasTopCategory && (
          <div className="flex items-start justify-between gap-3 rounded-xl bg-muted px-4 py-3">
            <span className="flex min-w-0 items-start gap-2 text-sm font-medium">
              <TrendingDown className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>Крупнее всего расходы: {getCategoryName(topCategory.category)}</span>
            </span>
            <span className="flex-shrink-0 text-sm font-semibold">{formatCurrency(topCategory.amount)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
