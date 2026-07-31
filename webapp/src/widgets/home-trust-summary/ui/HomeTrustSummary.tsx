import { AlertTriangle, ArrowDown, Equal, Info, Minus } from 'lucide-react';
import { useTransactions } from '@/entities/transaction/api/queries';
import { useUserStore } from '@/entities/user/model/store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { formatCurrency } from '@/shared/lib/formatters';
import { calculateHomeTrustSummary } from '../lib/calculateHomeTrustSummary';

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

  const {
    outgoingTotal,
    excludedTotal,
    needsReviewTotal,
    needsReviewCount,
    realExpenseTotal,
    excludedLabels,
  } = calculateHomeTrustSummary(transactions, startOfCurrentMonth());

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
            {needsReviewTotal > 0 && (
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                  Нужно проверить
                </span>
                <span className="font-semibold tabular-nums text-warning">−{formatSum(needsReviewTotal)}</span>
              </div>
            )}
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

        {needsReviewCount > 0 && (
          <div className="rounded-[1.1rem] border border-warning/20 bg-warning-muted p-3.5">
            <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-warning">
              <AlertTriangle className="h-4 w-4" />
              Требуют решения: {needsReviewCount}
            </div>
            <p className="text-xs leading-relaxed text-warning/80">
              Эти операции пока не входят в финальные расходы. Откройте транзакции и уточните смысл через chips.
            </p>
          </div>
        )}

        <p className="text-xs leading-relaxed text-muted-foreground">
          Формула: исходящие − не расходы − нужно проверить = реальные расходы.
        </p>
      </CardContent>
    </Card>
  );
}
