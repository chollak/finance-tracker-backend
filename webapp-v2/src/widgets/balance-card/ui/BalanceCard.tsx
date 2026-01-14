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
  const { data: insights, isLoading } = useDashboardInsights(userId);

  if (isLoading) {
    return (
      <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white">
        <CardHeader>
          <CardTitle>Баланс</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-full bg-slate-700" />
          <div className="flex justify-between">
            <Skeleton className="h-10 w-1/3 bg-slate-700" />
            <Skeleton className="h-10 w-1/3 bg-slate-700" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const balance = insights?.financialSummary?.netIncome ?? 0;
  const monthlyIncome = insights?.financialSummary?.totalIncome ?? 0;
  const monthlyExpense = insights?.financialSummary?.totalExpense ?? 0;

  const balanceFontSize = getDynamicFontSize(balance);
  const balanceColor = getBalanceColor(balance);

  return (
    <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white border-0">
      <CardHeader>
        <CardTitle className="text-lg font-medium text-slate-300">Баланс</CardTitle>
        <CardDescription className="text-slate-400">Текущее состояние счета</CardDescription>
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
            <p className="text-xs sm:text-sm text-slate-400 mb-1">Доход (месяц)</p>
            <p className="text-lg sm:text-xl font-semibold text-green-400">
              {formatCurrency(monthlyIncome)}
            </p>
          </div>

          {/* Monthly Expense */}
          <div className="flex-1 text-right">
            <p className="text-xs sm:text-sm text-slate-400 mb-1">Расход (месяц)</p>
            <p className="text-lg sm:text-xl font-semibold text-red-400">
              {formatCurrency(monthlyExpense)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
