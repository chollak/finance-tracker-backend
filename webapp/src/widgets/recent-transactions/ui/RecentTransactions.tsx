import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { Separator } from '@/shared/ui/separator';
import { Button, EmptyState } from '@/shared/ui';
import { useTransactions, TransactionListItem } from '@/entities/transaction';
import { useUserStore } from '@/entities/user';
import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';
import { Fragment } from 'react';

/**
 * Recent transactions widget
 * Shows the last 5-10 transactions with scrollable list
 */
export function RecentTransactions() {
  const navigate = useNavigate();
  const userId = useUserStore((state) => state.userId);
  const { data: transactions, isLoading } = useTransactions(userId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Последние транзакции</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Последние транзакции</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon="📝"
            title="Нет транзакций"
            description="Начните записывать расходы и доходы"
            tip="Регулярный учёт поможет понять, куда уходят деньги"
            action={
              <Button size="sm" onClick={() => navigate(ROUTES.ADD_TRANSACTION)}>
                Добавить транзакцию
              </Button>
            }
            size="sm"
          />
        </CardContent>
      </Card>
    );
  }

  const recentTransactions = transactions.slice(0, 10);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Последние транзакции</CardTitle>
          <CardDescription>Последние {recentTransactions.length} операций</CardDescription>
        </div>
        <Link
          to={ROUTES.TRANSACTIONS}
          className="text-sm text-primary hover:underline"
        >
          Все →
        </Link>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          {recentTransactions.map((transaction, index) => (
            <Fragment key={transaction.id}>
              <TransactionListItem transaction={transaction} />
              {index < recentTransactions.length - 1 && (
                <Separator className="my-2" />
              )}
            </Fragment>
          ))}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
