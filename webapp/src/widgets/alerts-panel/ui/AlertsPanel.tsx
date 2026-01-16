import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { AlertCard, useBudgetAlerts } from '@/entities/alert';
import { useUserStore } from '@/entities/user/model/store';
import { Link } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';

/**
 * Alerts panel widget
 * Shows critical budget alerts
 */
export function AlertsPanel() {
  const userId = useUserStore((state) => state.userId);
  const { data: alerts, isLoading } = useBudgetAlerts(userId, 0.8);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Уведомления</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!alerts || alerts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Уведомления</CardTitle>
          <CardDescription>Нет активных уведомлений</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Все ваши бюджеты в норме 👍
          </p>
        </CardContent>
      </Card>
    );
  }

  // Show only critical and high severity alerts (>= 80%)
  const criticalAlerts = alerts.filter((alert) => alert.severity === 'critical' || alert.severity === 'high');

  if (criticalAlerts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Уведомления</CardTitle>
          <CardDescription>Нет критичных уведомлений</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Все ваши бюджеты в норме 👍
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Уведомления</CardTitle>
          <CardDescription>Критичные уведомления: {criticalAlerts.length}</CardDescription>
        </div>
        <Link
          to={ROUTES.BUDGETS}
          className="text-sm text-primary hover:underline"
        >
          К бюджетам →
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {criticalAlerts.map((alert) => (
          <AlertCard key={alert.id} alert={alert} />
        ))}
      </CardContent>
    </Card>
  );
}
