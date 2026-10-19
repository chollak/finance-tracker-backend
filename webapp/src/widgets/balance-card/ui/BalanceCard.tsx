import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/shared/lib/utils';
import { ROUTES } from '@/shared/lib/constants/routes';
import { monthBounds, parseLocalDate, toLocalDate } from '@/shared/lib/dates';
import { SkeletonBlock } from '@/shared/ui/pastel';
import { useAccounts, type AccountsOverview } from '@/entities/account';
import { usePeriodTotals, type PeriodTotals } from '@/entities/transaction';
import { balanceAmountClass, balanceCardModel, spendShare } from '../lib/balanceCard';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-primary';

function Chevron({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true" className={className}>
      <path d="M5 7.5 10 12.5l5-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface Query<T> {
  data: T | undefined;
  isError: boolean;
}

export interface BalanceCardViewProps {
  accounts: Query<AccountsOverview>;
  totals: Query<PeriodTotals>;
  /** 1–12: the month of the line under the balance. */
  month: number;
  expanded: boolean;
  onToggle: () => void;
  className?: string;
}

/** The card as the board draws it, from data already read; `BalanceCard` reads it. */
export function BalanceCardView({ accounts, totals, month, expanded, onToggle, className }: BalanceCardViewProps) {
  const listId = useId();
  const model = accounts.data ? balanceCardModel(accounts.data) : null;
  const share = totals.data ? spendShare(totals.data, month) : null;

  return (
    <section
      aria-label="Баланс"
      className={cn('flex flex-col gap-1.5 rounded-hero bg-primary px-5 pb-5 pt-3 text-on-primary', className)}
    >
      <div className="flex min-h-touch items-center justify-between gap-2">
        <h1 className="text-[14px] font-semibold text-on-primary-muted">Всего на счетах</h1>
        {model && (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={listId}
            className={cn(
              '-mr-2 flex h-touch items-center gap-1 rounded-pill px-2 text-[14px] font-semibold text-on-primary-muted',
              FOCUS
            )}
          >
            <span>{model.countLabel}</span>
            <Chevron className={cn('transition-transform duration-150', expanded && 'rotate-180')} />
          </button>
        )}
      </div>

      {model ? (
        <div className="flex min-w-0 items-baseline gap-2">
          <span className={cn(balanceAmountClass(model.total), 'whitespace-nowrap')}>{model.total}</span>
          <span className="text-[18px] font-semibold text-on-primary-muted">{model.unit}</span>
        </div>
      ) : accounts.isError ? (
        <p className="py-2 text-[15px] font-semibold text-on-primary-muted">Не удалось загрузить остатки</p>
      ) : (
        <>
          <SkeletonBlock className="my-1 h-11 w-52 bg-hero-track" />
          <span className="sr-only">Считаем остатки…</span>
        </>
      )}

      {model && expanded && (
        <ul id={listId} className="mb-1 mt-2 flex flex-col gap-2 text-[14px]">
          {model.accounts.map((account) => (
            <li key={account.id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate text-on-primary-muted">{account.name}</span>
              <span className="shrink-0 whitespace-nowrap font-bold tabular-nums">{account.value}</span>
            </li>
          ))}
          {model.missingRateNote && <li className="text-[13px] font-medium text-on-primary-muted">{model.missingRateNote}</li>}
          <li>
            <Link
              to={ROUTES.ACCOUNTS}
              className={cn(
                '-mb-1.5 mt-0.5 flex min-h-touch items-center justify-between gap-3 border-t border-hero-track font-extrabold text-on-primary',
                FOCUS
              )}
            >
              Все счета и курс доллара
              <Chevron className="-rotate-90" />
            </Link>
          </li>
        </ul>
      )}

      {share?.kind === 'hint' && (
        <span className="mt-2.5 text-[13px] font-medium leading-[1.45] text-on-primary-muted">{share.text}</span>
      )}
      {share?.kind === 'share' && (
        <div className="mt-2.5 flex flex-col gap-2">
          <div aria-hidden="true" className="h-2 overflow-hidden rounded-pill bg-hero-track">
            <div className="h-full rounded-pill bg-hero-fill" style={{ width: `${share.barPercent}%` }} />
          </div>
          <span className="text-[13px] font-medium text-on-primary-muted">
            {share.lead} <span className="font-extrabold text-on-primary">{share.percent}</span> {share.tail}
          </span>
        </div>
      )}
      {!share && !totals.isError && <SkeletonBlock className="mt-2.5 h-2 w-full bg-hero-track" />}
    </section>
  );
}

/**
 * Balance card of Home (FT-111, boards «Главная», «Главная после первого запуска»; BalanceCard.md): the
 * total of the accounts exactly as GET /api/accounts gives it, «3 счёта» opening the accounts inside the
 * card with «Все счета и курс доллара», and one line — what share of this month's income is spent, from the
 * same totals service as the month tiles. In the dark theme the card turns light by the tokens alone.
 */
export function BalanceCard({ className }: { className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const today = toLocalDate(new Date());
  const accounts = useAccounts();
  const totals = usePeriodTotals(monthBounds(today));

  return (
    <BalanceCardView
      accounts={accounts}
      totals={totals}
      month={parseLocalDate(today).month}
      expanded={expanded}
      onToggle={() => setExpanded((value) => !value)}
      className={className}
    />
  );
}
