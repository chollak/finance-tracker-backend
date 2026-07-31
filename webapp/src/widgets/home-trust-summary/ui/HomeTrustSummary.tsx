import { ArrowDown, Equal, Info, Minus } from 'lucide-react';
import { useTransactions } from '@/entities/transaction/api/queries';
import { useUserStore } from '@/entities/user/model/store';
import { isNonExpenseMovement } from '@/entities/transaction';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { formatCurrency } from '@/shared/lib/formatters';

function startOfCurrentMonth(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function formatSum(amount: number): string {
  return formatCurrency(amount, { decimals: 0 }).replace('UZS', 'сум');
}

/**
 * Home semantic trust summary.
 * Explains why outgoing cashflow differs from real expenses.
 */
export function HomeTrustSummary() {
  const userId = useUserStore((state) => state.userId);
  const { data: transactions = [], isLoading } = useTransactions(userId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Почему цифры честные</CardTitle>
          <CardDescription>Отделяем реальные траты от движения денег</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </CardContent>
      </Card>
    );
  }

  const monthStart = startOfCurrentMonth();
  const monthTransactions = transactions.filter((transaction) => transaction.date >= monthStart);
  const outgoingTotal = monthTransactions
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const excludedTotal = monthTransactions
    .filter(
      (transaction) =>
        transaction.type === 'expense' && isNonExpenseMovement(transaction.semanticType ?? 'expense')
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const realExpenseTotal = Math.max(0, outgoingTotal - excludedTotal);

  const excludedLabels = Array.from(
    new Set(
      monthTransactions
        .filter(
          (transaction) =>
            transaction.type === 'expense' && isNonExpenseMovement(transaction.semanticType ?? 'expense')
        )
        .map((transaction) => transaction._semanticTypeLabel)
    )
  ).slice(0, 4);

  return (
    <Card className="overflow-hidden border-primary/10 bg-gradient-to-br from-card to-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>Почему цифры честные</CardTitle>
            <CardDescription>Не каждое исходящее движение — расход</CardDescription>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <Info className="h-3.5 w-3.5" />
            semantic
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-[1.35rem] border border-border/70 bg-background/80 p-4">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Исходящие операции</span>
              <span className="font-semibold tabular-nums text-foreground">{formatSum(outgoingTotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Minus className="h-3.5 w-3.5 text-primary" />
                Не расходы
              </span>
              <span className="font-semibold tabular-nums text-primary">−{formatSum(excludedTotal)}</span>
            </div>
            <div className="border-t border-border/70 pt-3">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 font-medium text-foreground">
                  <Equal className="h-3.5 w-3.5" />
                  Реальные расходы
                </span>
                <span className="font-semibold tabular-nums text-expense">{formatSum(realExpenseTotal)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[1.1rem] border border-primary/15 bg-primary/10 p-3.5">
          <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-primary">
            <ArrowDown className="h-4 w-4" />
            Не считаем расходом
          </div>
          <p className="text-xs leading-relaxed text-primary/80">
            Переводы себе, вклад, долги, возвраты и наличные не искажают статистику расходов.
          </p>
          {excludedLabels.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {excludedLabels.map((label) => (
                <span key={label} className="rounded-lg bg-background/70 px-2 py-1 text-[11px] font-medium text-primary">
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Почему? Деньги могли просто переехать между вашими счетами — например, с TBC на Alif или в копилку.
        </p>
      </CardContent>
    </Card>
  );
}
