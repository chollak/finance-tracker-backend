import { useMemo } from 'react';
import {
  CompactTransactionRow,
  formatDayGroupExpenseTotal,
  formatDayGroupNote,
  summarizeDayGroup,
  type DateGroup,
} from '@/entities/transaction';
import { Card } from '@/shared/ui/card';
import { cn } from '@/shared/lib/utils';

interface HistoryDayGroupProps {
  group: DateGroup;
  /**
   * `false` whenever the rows on screen are not the whole day, so the header cannot
   * name a total it does not have. Two cases: hidden rows, which are deliberately out
   * of every total the app reports, and a filtered list, where «Расходы» would carry
   * the date but count only the matches.
   */
  showSummary?: boolean;
  /**
   * Archived styling. Kept separate from `showSummary`: a filtered day also drops its
   * total, but its rows are live and must not be greyed out like hidden ones.
   */
  dimmed?: boolean;
  onOpen?: (id: string) => void;
  onArchive?: (id: string) => void;
  onUnarchive?: (id: string) => void;
  onDelete: (id: string) => void;
  className?: string;
}

/**
 * One day of History (FT-081).
 *
 * The day is the unit the user actually reviews in — «что я вчера записал» — so the
 * header carries the day's real-expense total and, under it, everything that total
 * leaves out. The rows themselves are the same `CompactTransactionRow` the Home
 * recent list uses, minus the per-row day marker the heading already provides, plus
 * the per-row actions menu that keeps edit/hide/delete reachable without a separate
 * management screen.
 */
export function HistoryDayGroup({
  group,
  showSummary = true,
  dimmed = false,
  onOpen,
  onArchive,
  onUnarchive,
  onDelete,
  className,
}: HistoryDayGroupProps) {
  const summary = useMemo(() => summarizeDayGroup(group.transactions), [group.transactions]);

  const expenseTotal = showSummary ? formatDayGroupExpenseTotal(summary) : null;
  const note = showSummary ? formatDayGroupNote(summary) : null;

  return (
    <section className={className}>
      {/* Sticky so the day a row belongs to stays on screen while its rows scroll past —
          the list is scanned by day, and a row loses its meaning without one. */}
      <header className="sticky top-0 z-10 bg-background pb-1.5 pt-1">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="min-w-0 truncate text-sm font-semibold leading-snug">{group.label}</h2>
          {expenseTotal && (
            <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
              {expenseTotal}
            </span>
          )}
        </div>
        {note && (
          <p className="mt-0.5 truncate text-xs leading-snug text-muted-foreground/80">{note}</p>
        )}
      </header>

      <Card className={cn('px-2 py-1', dimmed && 'bg-muted/30')}>
        <div className="divide-y divide-border/60">
          {group.transactions.map((transaction) => (
            <CompactTransactionRow
              key={transaction.id}
              transaction={transaction}
              showDayLabel={false}
              showActions
              onClick={onOpen && transaction.id ? () => onOpen(transaction.id!) : undefined}
              onArchive={onArchive && transaction.id ? () => onArchive(transaction.id!) : undefined}
              onUnarchive={
                onUnarchive && transaction.id ? () => onUnarchive(transaction.id!) : undefined
              }
              onDelete={transaction.id ? () => onDelete(transaction.id!) : undefined}
            />
          ))}
        </div>
      </Card>
    </section>
  );
}
