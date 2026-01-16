import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Progress } from '@/shared/ui/progress';
import { Skeleton } from '@/shared/ui/skeleton';
import { useDashboardInsights } from '@/entities/dashboard';
import { useUserStore } from '@/entities/user/model/store';
import { ChevronDown, ChevronUp } from 'lucide-react';

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
  const [showExplanation, setShowExplanation] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Финансовое здоровье</CardTitle>
          <CardDescription>Общая оценка вашего финансового состояния</CardDescription>
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

        {/* How it's calculated - collapsible */}
        <button
          onClick={() => setShowExplanation(!showExplanation)}
          className="w-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors pt-2"
        >
          Как рассчитывается?
          {showExplanation ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        {showExplanation && (
          <div className="text-xs text-muted-foreground space-y-3 pt-2 border-t">
            <p>Оценка учитывает 4 показателя:</p>
            <ul className="space-y-2">
              <li className="flex gap-2">
                <span className="font-medium text-foreground shrink-0">30%</span>
                <span><strong>Соблюдение бюджетов</strong> — сколько бюджетов вы не превысили</span>
              </li>
              <li className="flex gap-2">
                <span className="font-medium text-foreground shrink-0">25%</span>
                <span><strong>Уровень накоплений</strong> — какую часть дохода удаётся сохранить</span>
              </li>
              <li className="flex gap-2">
                <span className="font-medium text-foreground shrink-0">25%</span>
                <span><strong>Стабильность расходов</strong> — насколько предсказуемы траты из месяца в месяц</span>
              </li>
              <li className="flex gap-2">
                <span className="font-medium text-foreground shrink-0">20%</span>
                <span><strong>Разнообразие категорий</strong> — распределены ли траты по разным категориям</span>
              </li>
            </ul>
            <p className="text-[11px] opacity-75">
              Чем выше каждый показатель, тем лучше общая оценка.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
