import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Progress } from '@/shared/ui/progress';
import { Skeleton } from '@/shared/ui/skeleton';
import { useDashboardInsights } from '@/entities/dashboard';
import { useUserStore } from '@/entities/user';

/**
 * Get health score color and label
 */
function getHealthScoreInfo(score: number) {
  if (score >= 80) {
    return {
      color: 'text-green-600',
      bgColor: 'bg-green-500',
      label: 'Отлично',
      description: 'Ваше финансовое здоровье в отличном состоянии',
    };
  }
  if (score >= 60) {
    return {
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-500',
      label: 'Хорошо',
      description: 'Финансовое состояние стабильное, но есть куда расти',
    };
  }
  if (score >= 40) {
    return {
      color: 'text-orange-600',
      bgColor: 'bg-orange-500',
      label: 'Средне',
      description: 'Рекомендуем пересмотреть расходы и увеличить накопления',
    };
  }
  return {
    color: 'text-red-600',
    bgColor: 'bg-red-500',
    label: 'Требует внимания',
    description: 'Финансовое здоровье нуждается в улучшении',
  };
}

/**
 * Financial health widget
 * Shows health score visualization
 */
export function FinancialHealth() {
  const userId = useUserStore((state) => state.userId);
  const { data: dashboard, isLoading } = useDashboardInsights(userId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Финансовое здоровье</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Use healthScore from API (0-100 scale)
  const healthScore = Math.max(0, Math.min(100, dashboard?.healthScore?.score ?? 0));
  const { color, label, description } = getHealthScoreInfo(healthScore);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Финансовое здоровье</CardTitle>
        <CardDescription>Общая оценка вашего финансового состояния</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score Display */}
        <div className="text-center">
          <p className={`text-6xl font-bold ${color}`}>{healthScore}</p>
          <p className="text-sm text-muted-foreground mt-1">из 100</p>
        </div>

        {/* Progress Bar */}
        <Progress value={healthScore} className="h-3" />

        {/* Label & Description */}
        <div className="text-center space-y-2">
          <p className={`text-lg font-semibold ${color}`}>{label}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
