import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { useTransactions, TransactionListItem } from '@/entities/transaction';
import { useUserStore } from '@/entities/user';
import { Link } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';

/**
 * Recent transactions widget
 * Shows the last 5-10 transactions
 */
export function RecentTransactions() {
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
          <CardDescription>У вас пока нет транзакций</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            to={ROUTES.ADD_TRANSACTION}
            className="text-sm text-primary hover:underline"
          >
            Добавить первую транзакцию →
          </Link>
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
      <CardContent className="space-y-3">
        {recentTransactions.map((transaction) => (
          <TransactionListItem key={transaction.id} transaction={transaction} />
        ))}
      </CardContent>
    </Card>
  );
}
