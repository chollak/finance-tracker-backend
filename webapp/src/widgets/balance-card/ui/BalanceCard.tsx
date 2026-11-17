import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/shared/lib/utils';
import { ROUTES } from '@/shared/lib/constants/routes';
import { monthBounds, parseLocalDate, toLocalDate } from '@/shared/lib/dates';
import { SkeletonBlock } from '@/shared/ui/pastel';
import { useAccounts, type AccountsOverview } from '@/entities/account';
import { useSettings } from '@/entities/settings';
import { usePeriodTotals, type PeriodTotals } from '@/entities/transaction';
import { IN_UZS, useDisplayCurrency, type DisplayMoney } from '@/features/display-currency';
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
  /** The `defaultAccountId` setting (#367); without one — the first visible account in сум. */
  defaultAccountId?: string | null;
  /** The currency of the amounts («Сум / USD», FT-137); сум by default. */
  display?: DisplayMoney;
  /** 1–12: the month of the line under the balance. */
  month: number;
  expanded: boolean;
  onToggle: () => void;
  /** Reads again whatever failed: the balances, the month's totals (the tiles read the same totals). */
  onRetry: () => void;
  /** A retry is under way: the button waits instead of firing twice. */
  retrying?: boolean;
  className?: string;
}

/** The card as the board draws it, from data already read; `BalanceCard` reads it. */
export function BalanceCardView({
  accounts,
  totals,
  defaultAccountId = null,
  display = IN_UZS,
  month,
  expanded,
  onToggle,
  onRetry,
  retrying = false,
  className,
}: BalanceCardViewProps) {
  const listId = useId();
  const model = accounts.data ? balanceCardModel(accounts.data, defaultAccountId, display) : null;
  const share = totals.data ? spendShare(totals.data, month) : null;
  // A problem says what happened and what to do (design-system): each failed part says what is missing
  // where it would stand, and one «Попробовать снова» reads them again. FT-112 adds the slow state.
  const failed = (!model && accounts.isError) || (!share && totals.isError);

  return (
    <section
      aria-label="Баланс"
      className={cn('flex flex-col gap-1.5 rounded-hero bg-primary p-5 text-on-primary', className)}
    >
      {model ? (
        // One heading, so the amount is read with the account it belongs to: «Карта Visa 1 250 000 сум»
        <h1 className="flex min-w-0 flex-col gap-1.5">
          <span className="truncate text-[14px] font-semibold text-on-primary-muted">{model.title}</span>
          <span className="flex min-w-0 items-baseline gap-2">
            <span className={cn(balanceAmountClass(model.amount), 'whitespace-nowrap')}>{model.amount}</span>
            <span className="text-[18px] font-semibold text-on-primary-muted">{model.unit}</span>
          </span>
        </h1>
      ) : (
        <>
          <h1 className="text-[14px] font-semibold text-on-primary-muted">Баланс</h1>
          {accounts.isError ? (
            <p className="py-2 text-[15px] font-semibold text-on-primary-muted">Не удалось загрузить остатки.</p>
          ) : (
            <>
              <SkeletonBlock className="my-1 h-11 w-52 bg-hero-track" />
              <span className="sr-only">Считаем остатки…</span>
            </>
          )}
        </>
      )}

      {model?.total && (
        <button
          type="button"
          onClick={onToggle}
          aria-label={model.total.spoken}
          aria-expanded={expanded}
          // The list is in the page only while open, so it is named only then
          aria-controls={expanded ? listId : undefined}
          className={cn(
            '-mx-2 -mb-1.5 flex min-h-touch items-center justify-between gap-3 rounded-pill px-2 text-left text-[14px] font-semibold',
            FOCUS
          )}
        >
          <span className="text-on-primary-muted">{model.total.label}</span>
          <span className="flex shrink-0 items-center gap-1">
            <span className="whitespace-nowrap font-bold tabular-nums">{model.total.value}</span>
            <Chevron className={cn('text-on-primary-muted transition-transform duration-150', expanded && 'rotate-180')} />
          </span>
        </button>
      )}

      {/* Shown open or closed: the total above leaves the dollars out, so it must say so (money-model, rule 1) */}
      {model?.missingRateNote && <p className="text-[13px] font-medium text-on-primary-muted">{model.missingRateNote}</p>}

      {model && expanded && (
        <ul id={listId} className="mb-1 mt-2 flex flex-col gap-2 text-[14px]">
          {model.accounts.map((account) => (
            <li key={account.id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate text-on-primary-muted">{account.name}</span>
              <span className="shrink-0 whitespace-nowrap font-bold tabular-nums">{account.value}</span>
            </li>
          ))}
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
      {!share && totals.isError && (
        <span className="mt-2.5 text-[13px] font-medium text-on-primary-muted">Не удалось посчитать итоги месяца.</span>
      )}
      {!share && !totals.isError && <SkeletonBlock className="mt-2.5 h-2 w-full bg-hero-track" />}

      {failed && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          aria-busy={retrying}
          className={cn(
            '-ml-3 mt-1 flex h-touch items-center self-start rounded-pill px-3 text-[14px] font-extrabold text-on-primary disabled:text-on-primary-muted',
            FOCUS
          )}
        >
          Попробовать снова
        </button>
      )}
    </section>
  );
}

/**
 * Balance card of Home (FT-111, #367; BalanceCard.md): large — the default account (`defaultAccountId` of
 * the settings, else the account the server writes a record to) under its name; under it «Всего на N счетах»
 * with the total of the accounts exactly as GET /api/accounts gives it, opening the accounts inside the card
 * with «Все счета и курс доллара»; and one line — what share of this month's income is spent, from the same
 * totals service as the month tiles. In the dark theme the card turns light by the tokens alone. The amounts
 * are in the currency of «Сум / USD» in the header (FT-137).
 */
export function BalanceCard({ className }: { className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const today = toLocalDate(new Date());
  const accounts = useAccounts();
  const settings = useSettings();
  const totals = usePeriodTotals(monthBounds(today));
  const { shown, rateMinor } = useDisplayCurrency();

  return (
    <BalanceCardView
      accounts={accounts}
      totals={totals}
      // The settings are read before Home (the first-launch gate), so the card does not show one account and then another
      defaultAccountId={settings.data?.defaultAccountId ?? null}
      display={{ currency: shown, rateMinor }}
      month={parseLocalDate(today).month}
      expanded={expanded}
      onToggle={() => setExpanded((value) => !value)}
      onRetry={() => {
        if (accounts.isError) void accounts.refetch();
        if (totals.isError) void totals.refetch();
      }}
      retrying={(accounts.isError && accounts.isFetching) || (totals.isError && totals.isFetching)}
      className={className}
    />
  );
}
