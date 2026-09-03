import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { AmountText, MetricStat } from '@/shared/ui/typography';
import { useDashboardInsights } from '@/entities/dashboard';
import { useUserStore } from '@/entities/user/model/store';
import { ControlledQuickAddSheet } from '@/features/quick-add';

/**
 * Balance card widget
 * Shows monthly net cash flow, monthly income, and monthly expenses.
 */
export function BalanceCard() {
  const userId = useUserStore((state) => state.userId);
  const { data: dashboard, isLoading } = useDashboardInsights(userId);

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddType, setQuickAddType] = useState<'income' | 'expense'>('expense');

  const openQuickAdd = (type: 'income' | 'expense') => {
    setQuickAddType(type);
    setQuickAddOpen(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Чистый поток</CardTitle>
          <CardDescription>Доходы − расходы за месяц</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-14 w-full rounded-2xl" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const balance = dashboard?.insights?.financialSummary?.netIncome ?? 0;
  const monthlyIncome = dashboard?.insights?.financialSummary?.totalIncome ?? 0;
  const monthlyExpense = dashboard?.insights?.financialSummary?.totalExpense ?? 0;
  const balanceTone = balance > 0 ? 'income' : balance < 0 ? 'expense' : 'muted';

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>Чистый поток</CardTitle>
            <CardDescription>Доходы − расходы за месяц, не остаток на счёте</CardDescription>
          </div>
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Месяц
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-[1.35rem] bg-muted/45 px-4 py-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Итог
          </p>
          <AmountText amount={balance} tone={balanceTone} size="display" showPlus />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 border-income/20 bg-income-muted/40 text-income shadow-none hover:border-income/30 hover:bg-income-muted"
            onClick={() => openQuickAdd('income')}
          >
            <Plus className="h-4 w-4" />
            Доход
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 border-expense/20 bg-expense-muted/40 text-expense shadow-none hover:border-expense/30 hover:bg-expense-muted"
            onClick={() => openQuickAdd('expense')}
          >
            <Minus className="h-4 w-4" />
            Расход
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <MetricStat label="Доходы" amount={monthlyIncome} tone="income" />
          <MetricStat label="Расходы" amount={monthlyExpense} tone="expense" />
        </div>
      </CardContent>

      <ControlledQuickAddSheet
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        defaultType={quickAddType}
      />
    </Card>
  );
}
