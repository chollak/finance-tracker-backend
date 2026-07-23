import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { Separator } from '@/shared/ui/separator';
import { Button, EmptyState } from '@/shared/ui';
import { useTransactions, TransactionListItem } from '@/entities/transaction';
import { useUserStore } from '@/entities/user/model/store';
import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';
import { Fragment } from 'react';
import { Plus } from 'lucide-react';

/**
 * Recent transactions widget
 * Shows the last few transactions without nested scroll on mobile
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
          <CardDescription>Быстрый старт ежедневного учёта</CardDescription>
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

  const recentTransactions = transactions.slice(0, 5);

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Последние транзакции</CardTitle>
            <CardDescription>Нажмите строку, чтобы изменить</CardDescription>
          </div>
          <Button size="sm" className="h-9 gap-1.5" onClick={() => navigate(ROUTES.ADD_TRANSACTION)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Добавить
          </Button>
        </div>
        <Link
          to={ROUTES.TRANSACTIONS}
          className="text-sm text-primary hover:underline"
        >
          Все {transactions.length} транзакций →
        </Link>
      </CardHeader>
      <CardContent className="space-y-0">
        {recentTransactions.map((transaction, index) => (
          <Fragment key={transaction.id}>
            <TransactionListItem
              transaction={transaction}
              onClick={() => transaction.id && navigate(ROUTES.EDIT_TRANSACTION(transaction.id))}
              showActions={false}
            />
            {index < recentTransactions.length - 1 && (
              <Separator className="my-2" />
            )}
          </Fragment>
        ))}
      </CardContent>
    </Card>
  );
}
