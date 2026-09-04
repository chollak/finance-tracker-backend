import { useMemo, type ReactNode } from 'react';
import { Card } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { AmountText } from '@/shared/ui/typography';
import { useTransactions } from '@/entities/transaction';
import { useUserStore } from '@/entities/user/model/store';
import {
  calculateTodayTotal,
  formatTodayTotalMeta,
  TODAY_TOTAL_EMPTY_HINT,
} from '../lib/todayTotal';

const TITLE = 'Потрачено сегодня';

function TodayTotalShell({ children }: { children: ReactNode }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {TITLE}
      </p>
      {children}
    </Card>
  );
}

/**
 * Today's real spend — the daily feedback anchor above Quick Capture.
 *
 * Deliberately one number and one quiet line: it answers "сколько я сегодня
 * реально потратил?" right after a capture, without turning Home back into a
 * dashboard. Counts real expenses only — transfers, savings, cash withdrawals,
 * debts, refunds, archived rows and rows awaiting a correction stay out, the
 * same way the backend keeps them out of real-expense analytics.
 */
export function TodayTotal() {
  const userId = useUserStore((state) => state.userId);
  const { data: transactions, isLoading, isError } = useTransactions(userId);

  const summary = useMemo(
    () => (transactions ? calculateTodayTotal(transactions, new Date()) : null),
    [transactions]
  );

  // No resolved data yet — never render a 0 that reads like a finished count.
  if (!summary) {
    return (
      <TodayTotalShell>
        {isError ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Не удалось загрузить сегодняшние записи
          </p>
        ) : (
          <>
            <Skeleton className="mt-2 h-9 w-44 rounded-xl" aria-hidden="true" />
            <span className="sr-only">{isLoading ? 'Считаем…' : 'Ждём данные'}</span>
            <Skeleton className="mt-2.5 h-3 w-32 rounded-full" aria-hidden="true" />
          </>
        )}
      </TodayTotalShell>
    );
  }

  const meta = formatTodayTotalMeta(summary);

  return (
    <TodayTotalShell>
      <AmountText
        amount={summary.total}
        tone={summary.total > 0 ? 'default' : 'muted'}
        size="display"
        className="mt-2"
      />
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {meta ?? TODAY_TOTAL_EMPTY_HINT}
      </p>
    </TodayTotalShell>
  );
}
