import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { CompactTransactionRow, formatAllTransactionsLabel, useTransactions } from '@/entities/transaction';
import { useUserStore } from '@/entities/user/model/store';
import { ROUTES } from '@/shared/lib/constants/routes';

const TITLE = 'Последние';
const RECENT_LIMIT = 5;

function RecentShell({ action, children }: { action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="px-2 py-2">
      <div className="flex items-center justify-between gap-2 pl-2">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {TITLE}
        </p>
        {action}
      </div>
      {children}
    </Card>
  );
}

/**
 * Recent transactions — the correction log of the quick-action loop (FT-080).
 *
 * The list exists to answer one question right after a capture: «записалось ли это
 * правильно?». So it is deliberately not a management surface — no add button
 * competing with the dock's `Записать`, no instructions, no per-row menu. Just the
 * last few captures as compact rows, each opening the edit screen, and the flagged
 * ones offering their one-tap correction inline.
 *
 * The full list with filters, archive and bulk actions stays one quiet link away on
 * the History page.
 */
export function RecentTransactions() {
  const navigate = useNavigate();
  const userId = useUserStore((state) => state.userId);
  const { data: transactions, isLoading } = useTransactions(userId);

  if (isLoading) {
    return (
      <RecentShell>
        <div className="mt-1 space-y-1" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-[52px] w-full rounded-xl" />
          ))}
        </div>
        <span className="sr-only">Загружаем последние операции…</span>
      </RecentShell>
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <RecentShell>
        {/* Minimal on purpose: the capture card above and `Записать` in the dock are
            already the two ways in, so an empty log only has to say it is empty. */}
        <div className="px-2 pb-3 pt-2">
          <p className="text-sm font-medium leading-snug">Пока ничего не записано</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Первая операция появится здесь сразу после записи
          </p>
        </div>
      </RecentShell>
    );
  }

  const recentTransactions = transactions.slice(0, RECENT_LIMIT);

  return (
    <RecentShell
      action={
        <Link
          to={ROUTES.TRANSACTIONS}
          className="-mr-1 inline-flex min-h-11 items-center gap-0.5 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {formatAllTransactionsLabel(transactions.length)}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      }
    >
      <div className="divide-y divide-border/60">
        {recentTransactions.map((transaction) => (
          <CompactTransactionRow
            key={transaction.id}
            transaction={transaction}
            onClick={() => transaction.id && navigate(ROUTES.EDIT_TRANSACTION(transaction.id))}
          />
        ))}
      </div>
    </RecentShell>
  );
}
