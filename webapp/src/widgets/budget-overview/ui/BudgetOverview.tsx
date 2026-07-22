import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Progress } from '@/shared/ui/progress';
import { Badge } from '@/shared/ui/badge';
import { Skeleton } from '@/shared/ui/skeleton';
import { Button, EmptyState } from '@/shared/ui';
import { useBudgetSummaries, budgetToViewModel } from '@/entities/budget';
import { useUserStore } from '@/entities/user/model/store';
import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';

/**
 * Budget overview widget
 * Shows summary of all active budgets with progress bars
 */
export function BudgetOverview() {
  const navigate = useNavigate();
  const userId = useUserStore((state) => state.userId);
  const { data: budgets, isLoading } = useBudgetSummaries(userId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Бюджеты</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!budgets || budgets.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Бюджеты</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon="📊"
            title="Нет активных бюджетов"
            description="Создайте бюджет, чтобы контролировать расходы по категориям"
            tip="Бюджеты помогают не превышать лимиты на еду, транспорт и другие категории"
            action={
              <Button size="sm" onClick={() => navigate(ROUTES.ADD_BUDGET)}>
                Создать бюджет
              </Button>
            }
            size="sm"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Бюджеты</CardTitle>
          <CardDescription>Активные бюджеты: {budgets.length}</CardDescription>
        </div>
        <Link
          to={ROUTES.BUDGETS}
          className="text-sm text-primary hover:underline"
        >
          Все →
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {budgets.slice(0, 3).map((budget) => {
          const vm = budgetToViewModel(budget);

          return (
            <div key={budget.id} className="space-y-2">
              {/* Budget Name & Status */}
              <div className="flex items-center justify-between">
                <p className="font-medium">{budget.name}</p>
                <Badge variant="outline" className={vm._statusColor}>
                  {vm._statusText}
                </Badge>
              </div>

              {/* Actionable headline */}
              <p className={`text-lg font-bold ${vm._remainingColor}`}>
                {vm._remainingLabel} {vm._remainingAmountText}
              </p>

              {/* Progress Bar (secondary: spent/total + percentage) */}
              <Progress
                value={Math.min(vm.percentageUsed, 100)}
                className="h-2"
                indicatorClassName={vm._progressColor}
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {vm._formattedSpent} / {vm._formattedAmount}
                </span>
                <span>{vm._percentageText}</span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
