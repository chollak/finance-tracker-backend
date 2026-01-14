import { Card, CardContent } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { useQuickStats } from '@/entities/dashboard';
import { useUserStore } from '@/entities/user';

/**
 * Quick stats widget
 * Shows active budgets count, alerts count, and savings rate
 */
export function QuickStats() {
  const userId = useUserStore((state) => state.userId);
  const { data: stats, isLoading } = useQuickStats(userId);

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const activeBudgets = stats?.activeBudgets ?? 0;
  const alertsCount = stats?.alertsCount ?? 0;
  const savingsRate = stats?.savingsRate ?? 0;

  return (
    <div className="grid grid-cols-3 gap-4">
      {/* Active Budgets */}
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-3xl font-bold">{activeBudgets}</p>
            <p className="text-sm text-muted-foreground mt-1">Активных бюджетов</p>
          </div>
        </CardContent>
      </Card>

      {/* Alerts Count */}
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <p className={`text-3xl font-bold ${alertsCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {alertsCount}
            </p>
            <p className="text-sm text-muted-foreground mt-1">Уведомлений</p>
          </div>
        </CardContent>
      </Card>

      {/* Savings Rate */}
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <p className={`text-3xl font-bold ${savingsRate > 0 ? 'text-green-600' : 'text-orange-600'}`}>
              {savingsRate}%
            </p>
            <p className="text-sm text-muted-foreground mt-1">Накопления</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
