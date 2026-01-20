import { Card, CardContent } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { useDashboardInsights } from '@/entities/dashboard';
import { useUserStore } from '@/entities/user/model/store';

/**
 * Quick stats widget
 * Shows active budgets count and savings rate
 * Optimized: Uses shared dashboard data instead of separate API call
 */
export function QuickStats() {
  const userId = useUserStore((state) => state.userId);
  // Use same query as BalanceCard - data is shared via React Query cache
  const { data: dashboard, isLoading } = useDashboardInsights(userId);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Extract data from dashboard response (same data, no extra API call)
  const activeBudgets = dashboard?.insights?.budgetOverview?.activeBudgets ?? 0;
  const rawSavingsRate = dashboard?.insights?.insights?.savingsRate ?? 0;
  const totalIncome = dashboard?.insights?.financialSummary?.totalIncome ?? 0;

  // Format savings rate for display
  // If no income, show "–" instead of 0%
  // Clamp extreme values to -99% to 999% for reasonable display
  const formatSavingsRate = (): string => {
    if (totalIncome === 0) return '–';
    if (rawSavingsRate < -99) return '<-99';
    if (rawSavingsRate > 999) return '>999';
    return String(Math.round(rawSavingsRate));
  };

  const savingsRateDisplay = formatSavingsRate();
  const isPositive = rawSavingsRate > 0;
  const isNeutral = totalIncome === 0;

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Active Budgets */}
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-2xl sm:text-3xl font-bold">{activeBudgets}</p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">Активных бюджетов</p>
          </div>
        </CardContent>
      </Card>

      {/* Savings Rate */}
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <p className={`text-2xl sm:text-3xl font-bold ${isNeutral ? 'text-muted-foreground' : isPositive ? 'text-success' : 'text-warning'}`}>
              {savingsRateDisplay}{savingsRateDisplay !== '–' && '%'}
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">Накопления</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
