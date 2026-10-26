import { useEffect, useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { Button, Keypad } from '@/shared/ui/pastel';
import { useUsdRate } from '@/entities/rate';
import { useSaveOpeningBalances } from '../api/mutations';
import {
  activeCurrency,
  initialOpeningBalances,
  keyFromKeyboard,
  openingBalancesNote,
  openingBalancesPayload,
  openingBalancesRows,
  pressOpeningKey,
  selectOpeningRow,
  startButtonLabel,
  type OpeningBalancesRow,
  type OpeningSlot,
} from '../model/openingBalances';

function SlotIcon({ slot }: { slot: OpeningSlot }) {
  if (slot === 'usd') return <span className="text-[17px] font-extrabold">$</span>;
  if (slot === 'card') {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <rect x="2.5" y="4.5" width="15" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M2.5 8.5h15" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2" y="5.5" width="16" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="10" cy="10" r="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function BalanceRow({ row, onSelect }: { row: OpeningBalancesRow; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={row.active}
      aria-label={row.ariaLabel}
      onClick={onSelect}
      className={cn(
        'flex min-h-row w-full items-center gap-3 rounded-control px-3 py-2 text-left text-ink',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-muted',
        row.active && 'ring-2 ring-inset ring-ink focus-visible:ring-ink'
      )}
    >
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-track">
        <SlotIcon slot={row.slot} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="type-body-strong">{row.name}</span>
        <span className="type-label text-ink-muted">{row.caption}</span>
      </span>
      <span className="flex shrink-0 items-baseline gap-1">
        <span
          className={cn(
            'whitespace-nowrap text-[20px] font-extrabold tracking-[-0.4px] tabular-nums',
            row.isPlaceholder ? 'text-ink-muted' : 'text-ink'
          )}
        >
          {row.value}
        </span>
        <span className="text-[13px] font-bold text-ink-muted">{row.unit}</span>
      </span>
    </button>
  );
}

/**
 * «Сколько у вас сейчас денег?» (FT-109): cash, card and dollars, the app's own keypad typing into the
 * chosen row, one button. Saving makes the amounts opening balances dated today and ends the first launch.
 */
export function OpeningBalancesForm({ className }: { className?: string }) {
  const [state, setState] = useState(initialOpeningBalances);
  const rate = useUsdRate();
  const save = useSaveOpeningBalances();

  const rows = openingBalancesRows(state);
  const active = rows.find((row) => row.active)!;
  const currency = activeCurrency(state);
  const effective = rate.data?.effective ?? null;
  const failed = save.isError && save.error.statusCode !== 409;

  // From a computer keyboard (Telegram Desktop): the same digits, erase and comma.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = keyFromKeyboard(event.key, currency);
      if (!key) return;
      event.preventDefault();
      setState((current) => pressOpeningKey(current, key));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currency]);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <p role="status" className="sr-only">
        {`${active.name}: ${active.value} ${active.currency === 'USD' ? 'долларов' : 'сум'}`}
      </p>

      <div role="radiogroup" aria-label="Какой остаток вводить" className="flex flex-col gap-1 rounded-card bg-card p-1">
        {rows.map((row) => (
          <BalanceRow key={row.slot} row={row} onSelect={() => setState((current) => selectOpeningRow(current, row.slot))} />
        ))}
      </div>

      <p className={cn('mx-1 type-label leading-[1.45]', failed ? 'text-ink' : 'text-ink-muted')}>
        {failed
          ? 'Не получилось сохранить. Проверьте связь и нажмите ещё раз.'
          : openingBalancesNote(state, effective && { rateMinor: effective.rateMinor, source: effective.source })}
      </p>

      <div className="mt-auto flex flex-col gap-3">
        <Keypad currency={currency} onKey={(key) => setState((current) => pressOpeningKey(current, key))} />
        <Button
          onClick={() => save.mutate(openingBalancesPayload(state))}
          disabled={save.isPending}
          aria-busy={save.isPending}
        >
          {startButtonLabel(state)}
        </Button>
      </div>
    </div>
  );
}
