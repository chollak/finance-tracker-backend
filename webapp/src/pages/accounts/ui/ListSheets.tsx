import { useCallback, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { createAccount, deleteAccount, updateAccount } from '@/entities/account';
import { clearOwnUsdRate, setOwnUsdRate, type UsdRates } from '@/entities/rate';
import { type LocalDate } from '@/shared/lib/dates';
import { pressKey, type KeypadKey } from '@/shared/lib/money';
import { showUndoToast } from '@/shared/lib/undo';
import { cn } from '@/shared/lib/utils';
import { Button, Keypad, Segmented, Sheet } from '@/shared/ui/pastel';
import { CURRENCY_OPTIONS, KIND_OPTIONS, NEW_ACCOUNT, newAccountView, type NewAccountDraft } from '../model/accountForms';
import type { HiddenAccountRow } from '../model/accountsList';
import { chooseRateMode, openRateSheet, pressRateKey, rateSheetView, type RateChange, type RateMode } from '../model/rateSheet';
import { AmountCard, FOCUS, NameField } from './parts';
import { useKeypadKeyboard } from './useKeypadKeyboard';
import { useAccountWrite } from './useAccountWrite';

/** A failed save, said inside the sheet: the toast would be hidden behind it. */
export function SheetError({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="type-label mx-1 shrink-0 text-ink">
      {text}
    </p>
  );
}

/**
 * «Новый счёт» (board «Новый счёт»): the name, «Наличные / Карта» and «Сумы / Доллары» each on its own line (they
 * must fit Uzbek labels), «Сколько на нём сейчас» on the app's keypad — the opening balance, not income. While the
 * name is being typed the phone's keyboard is up, so the keypad steps aside. The new account shows in the list with
 * «Счёт добавлен» and «Отменить», which takes it back while nothing has been recorded on it (the server refuses an
 * account with operations: such an account is hidden, never deleted).
 */
export function NewAccountSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [draft, setDraft] = useState<NewAccountDraft>(NEW_ACCOUNT);
  const [typingName, setTypingName] = useState(false);
  const write = useAccountWrite();
  const view = newAccountView(draft);

  const onKey = useCallback((key: KeypadKey) => setDraft((current) => ({ ...current, amount: pressKey(current.amount, key, current.currency) })), []);
  useKeypadKeyboard(draft.currency, onKey, open);

  const save = async () => {
    const { payload, saved } = view;
    if (!payload || write.busy) return;
    const done = await write.run((queryClient, userId) => createAccount(queryClient, userId, payload));
    if (!done) return;
    onOpenChange(false);
    const { queryClient, userId } = write;
    const { id } = done.value;
    if (saved) showUndoToast({ kind: 'saved', ...saved, undo: () => deleteAccount(queryClient, userId, id) });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Новый счёт">
      <NameField
        value={draft.name}
        onChange={(name) => {
          write.clearError();
          setDraft((current) => ({ ...current, name }));
        }}
        placeholder="Например, Копилка"
        onFocusChange={setTypingName}
      />
      <Segmented
        options={KIND_OPTIONS}
        value={draft.kind}
        onChange={(kind) => setDraft((current) => ({ ...current, kind }))}
        ariaLabel="Тип счёта"
        inSheet
        className="shrink-0"
      />
      <Segmented
        options={CURRENCY_OPTIONS}
        value={draft.currency}
        // Another currency is another number: the balance is typed again
        onChange={(currency) => setDraft((current) => ({ ...current, currency, amount: NEW_ACCOUNT.amount }))}
        ariaLabel="Валюта счёта"
        inSheet
        className="shrink-0"
      />
      <AmountCard label="Сколько на нём сейчас" amount={view.amount} note="Это начальный остаток — он не попадёт в доходы." />
      {!typingName && (
        <Keypad currency={draft.currency} state={draft.amount} onChange={(amount) => setDraft((current) => ({ ...current, amount }))} inSheet className="shrink-0" />
      )}
      <SheetError text={write.error} />
      <Button inSheet onClick={() => void save()} disabled={!view.button.ready || write.busy} aria-busy={write.busy || undefined}>
        {view.button.label}
      </Button>
    </Sheet>
  );
}

/**
 * «Скрытые счета» (board «Скрытые счета»): each hidden account with its balance and «Показать». It comes back into
 * the total and the pickers with «Отменить»; once none is left the sheet closes.
 */
export function HiddenAccountsSheet({
  open,
  onOpenChange,
  accounts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: HiddenAccountRow[];
}) {
  const write = useAccountWrite();

  const show = async (account: HiddenAccountRow) => {
    if (write.busy) return;
    const done = await write.run((queryClient, userId) => updateAccount(queryClient, userId, account.id, { isHidden: false }));
    if (!done) return;
    if (accounts.length <= 1) onOpenChange(false);
    const { queryClient, userId } = write;
    showUndoToast({
      kind: 'changed',
      title: 'Счёт снова виден',
      detail: `${account.name} · ${account.balance}`,
      undo: () => updateAccount(queryClient, userId, account.id, { isHidden: true }).then(() => undefined),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Скрытые счета">
      <ul className="shrink-0 rounded-card bg-sheet-card px-4 [&>*+*]:border-t [&>*+*]:border-line">
        {accounts.map((account) => (
          <li key={account.id} className="flex min-h-row items-center gap-3">
            <span className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="type-body-strong truncate text-ink">{account.name}</span>
              <span className="type-label tabular-nums text-ink-muted">{account.balance}</span>
            </span>
            <button
              type="button"
              onClick={() => void show(account)}
              disabled={write.busy}
              aria-label={account.ariaLabel}
              className={cn('h-touch shrink-0 rounded-pill bg-sheet-track px-4 text-[14px] font-extrabold text-ink disabled:text-seg-off', FOCUS)}
            >
              Показать
            </button>
          </li>
        ))}
      </ul>
      <SheetError text={write.error} />
      <p className="type-label mx-1 shrink-0 leading-[1.45] text-ink-muted">
        Скрытые счета не входят в итог и не предлагаются при записи, но их операции остаются в истории и аналитике.
      </p>
    </Sheet>
  );
}

const RATE_MODES: ReadonlyArray<{ value: RateMode; label: string }> = [
  { value: 'cbu', label: 'Курс ЦБ' },
  { value: 'own', label: 'Свой курс' },
];

/** What «Готово» — or «Отменить» after it — writes: an own rate (with its date, coming back) or the Central Bank's. */
function applyRate(queryClient: QueryClient, userId: string, change: RateChange): Promise<UsdRates> {
  return change.kind === 'own'
    ? setOwnUsdRate(queryClient, userId, change.rateMinor, change.since)
    : clearOwnUsdRate(queryClient, userId);
}

/**
 * «Курс доллара» from the rate row (FT-119, board «Курс доллара · свой курс», RateRow.md): «Курс ЦБ / Свой курс».
 * The Central Bank rate with its date; or the own rate on the app's keypad, compared with the Central Bank's, that
 * does not set itself — until something is typed the button asks for a rate. «Готово» applies a change with a toast
 * and «Отменить»; with an own rate in effect «Курс ЦБ» turns it into «Вернуть курс ЦБ». Closing the sheet — or
 * «Готово» with the same rate — changes nothing. Opened afresh each time (the page keys it), on the rate in effect.
 */
export function RateSheet({
  open,
  onOpenChange,
  rates,
  online,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rates: UsdRates | undefined;
  online: boolean;
  today: LocalDate;
}) {
  const [state, setState] = useState(() => openRateSheet(rates));
  const write = useAccountWrite();
  const view = rateSheetView(rates, state, { online, today });

  const onKey = useCallback((key: KeypadKey) => setState((current) => pressRateKey(current, key)), []);
  useKeypadKeyboard('UZS', onKey, open && state.mode === 'own');

  const done = async () => {
    const { change, undo, saved, button } = view;
    if (!button.ready || write.busy) return;
    if (!change) {
      onOpenChange(false);
      return;
    }
    const applied = await write.run((queryClient, userId) => applyRate(queryClient, userId, change));
    if (!applied) return;
    onOpenChange(false);
    const { queryClient, userId } = write;
    if (saved) showUndoToast({ kind: 'changed', ...saved, undo: () => applyRate(queryClient, userId, undo).then(() => undefined) });
  };

  const consequence = (
    <p className="type-label mx-1 shrink-0 leading-[1.45] text-ink-muted">
      По этому курсу считаются итог на главной и суммы в долларах. Прошлые обмены не меняются — у каждого свой курс сделки.
    </p>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Курс доллара">
      <Segmented
        options={RATE_MODES}
        value={view.mode}
        onChange={(mode) => {
          write.clearError();
          setState((current) => chooseRateMode(current, mode, rates));
        }}
        ariaLabel="Какой курс использовать"
        inSheet
        className="shrink-0"
      />
      {view.cbu && (
        <div className="flex shrink-0 flex-col gap-1 rounded-card bg-sheet-card px-4 py-3.5">
          <span className="type-label font-bold text-ink-muted">{view.cbu.label}</span>
          {view.cbu.value && (
            <p className="flex items-baseline gap-1.5">
              <span className="text-[32px] font-extrabold leading-[1.1] tracking-[-1px] tabular-nums text-ink">{view.cbu.value}</span>
              <span className="text-[15px] font-bold text-ink-muted">сум за $1</span>
            </p>
          )}
          <span className="type-label leading-[1.45] text-ink-muted">{view.cbu.hint}</span>
        </div>
      )}
      {consequence}
      {view.own && (
        <>
          <AmountCard label={view.own.label} amount={{ ...view.own.amount, unit: '' }} note={view.own.hint} />
          <Keypad currency="UZS" onKey={onKey} inSheet className="shrink-0" />
        </>
      )}
      <SheetError text={write.error} />
      <Button inSheet onClick={() => void done()} disabled={!view.button.ready || write.busy} aria-busy={write.busy || undefined}>
        {view.button.label}
      </Button>
    </Sheet>
  );
}
