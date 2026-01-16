import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Progress } from '@/shared/ui/progress';
import { Badge } from '@/shared/ui/badge';
import { Skeleton } from '@/shared/ui/skeleton';
import { Button, EmptyState } from '@/shared/ui';
import { useBudgetSummaries } from '@/entities/budget';
import { useUserStore } from '@/entities/user';
import { formatCurrency } from '@/shared/lib/formatters';
import {
  calculateProgress,
  getBudgetStatus,
  getStatusColor,
} from '../lib/calculateProgress';
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
          const progress = calculateProgress(budget);
          const status = getBudgetStatus(budget);
          const statusColor = getStatusColor(budget);

          return (
            <div key={budget.id} className="space-y-2">
              {/* Budget Name & Status */}
              <div className="flex items-center justify-between">
                <p className="font-medium">{budget.name}</p>
                <Badge variant="outline" className={statusColor}>
                  {status}
                </Badge>
              </div>

              {/* Progress Bar */}
              <Progress value={Math.min(progress, 100)} className="h-2" />

              {/* Spent / Amount */}
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {formatCurrency(budget.spent)} / {formatCurrency(budget.amount)}
                </span>
                <span>{progress}%</span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
