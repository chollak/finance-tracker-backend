import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { useDashboardInsights } from '@/entities/dashboard';
import { useUserStore } from '@/entities/user';
import { formatBalance, getDynamicFontSize, getBalanceColor } from '../lib/formatBalance';
import { formatCurrency } from '@/shared/lib/formatters';

/**
 * Balance card widget
 * Shows current balance, monthly income, and monthly expenses
 */
export function BalanceCard() {
  const userId = useUserStore((state) => state.userId);
  const { data: dashboard, isLoading } = useDashboardInsights(userId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Баланс</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <div className="flex justify-between">
            <Skeleton className="h-10 w-1/3" />
            <Skeleton className="h-10 w-1/3" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const balance = dashboard?.insights?.financialSummary?.netIncome ?? 0;
  const monthlyIncome = dashboard?.insights?.financialSummary?.totalIncome ?? 0;
  const monthlyExpense = dashboard?.insights?.financialSummary?.totalExpense ?? 0;

  const balanceFontSize = getDynamicFontSize(balance);
  const balanceColor = getBalanceColor(balance);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-medium">Баланс</CardTitle>
        <CardDescription>Текущее состояние счета</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Balance Amount */}
        <div className={`font-bold ${balanceFontSize} ${balanceColor} break-all`}>
          {formatBalance(balance)}
        </div>

        {/* Income & Expense Row */}
        <div className="flex justify-between items-center gap-4">
          {/* Monthly Income */}
          <div className="flex-1">
            <p className="text-xs sm:text-sm text-muted-foreground mb-1">Доход (месяц)</p>
            <p className="text-lg sm:text-xl font-semibold text-green-600">
              {formatCurrency(monthlyIncome)}
            </p>
          </div>

          {/* Monthly Expense */}
          <div className="flex-1 text-right">
            <p className="text-xs sm:text-sm text-muted-foreground mb-1">Расход (месяц)</p>
            <p className="text-lg sm:text-xl font-semibold text-red-600">
              {formatCurrency(monthlyExpense)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
