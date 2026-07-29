import { Card, CardContent } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { useDashboardInsights } from '@/entities/dashboard';
import { useUserStore } from '@/entities/user/model/store';
import { cn } from '@/shared/lib/utils';

function StatCard({ value, suffix, label, tone }: { value: string; suffix?: string; label: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-center">
          <p className={cn('text-2xl font-bold leading-none tracking-[-0.03em] tabular-nums', tone)}>
            {value}{suffix && <span className="text-base font-semibold text-current/70">{suffix}</span>}
          </p>
          <p className="mt-2 text-xs font-medium leading-tight text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Quick stats widget
 * Shows active budgets count and savings rate
 * Optimized: Uses shared dashboard data instead of separate API call
 */
export function QuickStats() {
  const userId = useUserStore((state) => state.userId);
  const { data: dashboard, isLoading } = useDashboardInsights(userId);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-2.5">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="py-4">
              <Skeleton className="h-12 w-full rounded-2xl" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const activeBudgets = dashboard?.insights?.budgetOverview?.activeBudgets ?? 0;
  const rawSavingsRate = dashboard?.insights?.insights?.savingsRate ?? 0;
  const totalIncome = dashboard?.insights?.financialSummary?.totalIncome ?? 0;

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
    <div className="grid grid-cols-2 gap-2.5">
      <StatCard value={String(activeBudgets)} label="Активных бюджетов" />
      <StatCard
        value={savingsRateDisplay}
        suffix={savingsRateDisplay !== '–' ? '%' : undefined}
        label="Накопления"
        tone={isNeutral ? 'text-muted-foreground' : isPositive ? 'text-success' : 'text-warning'}
      />
    </div>
  );
}
