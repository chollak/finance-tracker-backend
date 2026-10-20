import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeftRight } from 'lucide-react';
import { createMove, deleteMove, useAccounts, visibleAccounts } from '@/entities/account';
import { useUsdRate } from '@/entities/rate';
import { useIsGuest } from '@/entities/user';
import { TRANSFER_FROM_PARAM } from '@/shared/lib/constants/routes';
import type { KeypadKey } from '@/shared/lib/money';
import { useCloseScreen } from '@/shared/lib/navigation';
import { showUndoToast } from '@/shared/lib/undo';
import { cn } from '@/shared/lib/utils';
import { AccountPicker, BackButton, Button, Keypad, ProblemScreen, SkeletonBlock } from '@/shared/ui/pastel';
import { knownRates } from '../model/rateRow';
import {
  chooseTransferAccount,
  focusTransferField,
  pressTransferKey,
  startTransfer,
  swapTransfer,
  transferView,
  type TransferAmountView,
  type TransferContext,
  type TransferField,
  type TransferState,
} from '../model/transferForm';
import { SheetError } from './ListSheets';
import { FOCUS, GuestAccounts, Icon, ReadFailed } from './parts';
import { useAccountWrite } from './useAccountWrite';
import { useKeypadKeyboard } from './useKeypadKeyboard';

/** The board's 30px/800; a long amount steps down instead of wrapping. */
const amountSize = (text: string) => (text.length > 12 ? 'text-[24px] tracking-[-0.6px]' : 'text-[30px] tracking-[-0.8px]');

function AccountChoice({ name, ariaLabel, onPick }: { name: string; ariaLabel: string; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-haspopup="dialog"
      aria-label={ariaLabel}
      className={cn('-mr-2 flex h-touch min-w-0 items-center gap-1.5 rounded-pill px-2.5 text-[15px] font-extrabold text-ink', FOCUS)}
    >
      <span className="truncate">{name}</span>
      <Icon name="down" className="size-3.5 shrink-0" />
    </button>
  );
}

/** An amount of the form: a press makes it active (the ring), the keypad types into it. */
function AmountField({
  amount,
  ariaLabel,
  active,
  ring,
  onFocus,
}: {
  amount: TransferAmountView;
  ariaLabel: string;
  active: boolean;
  ring: boolean;
  onFocus: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onFocus}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={cn(
        '-mx-3 flex min-h-[52px] min-w-0 items-center gap-1.5 rounded-tile px-3 py-1 text-left text-ink',
        ring && 'ring-2 ring-inset ring-ink',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink'
      )}
    >
      <span
        className={cn(
          'whitespace-nowrap font-extrabold leading-[1.15] tabular-nums',
          amountSize(amount.text),
          amount.placeholder ? 'text-ink-muted' : 'text-ink'
        )}
      >
        {amount.text}
      </span>
      <span className="text-[15px] font-bold text-ink-muted">{amount.unit}</span>
    </button>
  );
}

/** The shapes of the form while the accounts are read (Skeleton.md). */
function LoadingForm() {
  return (
    <div className="flex flex-col gap-2.5" aria-hidden="true">
      {[0, 1].map((card) => (
        <div key={card} className="flex flex-col gap-2 rounded-card bg-card px-4 py-3.5">
          <div className="flex items-center justify-between">
            <SkeletonBlock className="h-3.5 w-16" />
            <SkeletonBlock className="h-3.5 w-20" />
          </div>
          <SkeletonBlock className="h-8 w-40" radius="tile" />
          <SkeletonBlock className="h-3 w-56" />
        </div>
      ))}
    </div>
  );
}

/**
 * The form itself, once the accounts are known: its state, the pickers, the keypad from the screen and from a
 * computer keyboard, and the write. A written move closes the form; the screen that opened it shows «Перевод записан»
 * / «Обмен записан» with «Отменить», which deletes the move (both balances come back). Left with «Назад» while the
 * move is written, the form is already closed: the move and its toast still come, another step back does not.
 */
function TransferForm({ context, fromId }: { context: TransferContext; fromId: string | null }) {
  const [state, setState] = useState<TransferState | null>(() => startTransfer(context.accounts, fromId));
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const write = useAccountWrite();
  const { clearError } = write;
  const close = useCloseScreen();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const onState = useCallback(
    (change: (current: TransferState) => TransferState) => {
      clearError();
      setState((current) => (current ? change(current) : current));
    },
    [clearError]
  );

  // An account of the form went away (hidden elsewhere, read again): start over from what is visible now
  const known = (id: string) => context.accounts.some((account) => account.id === id);
  const current = state && known(state.fromId) && known(state.toId) ? state : startTransfer(context.accounts, fromId);
  if (current !== state) setState(current);
  if (!current) return null;

  const submit = async () => {
    const { payload, saved } = transferView(current, context);
    if (!payload || !saved || write.busy) return;
    const done = await write.run((queryClient, userId) => createMove(queryClient, userId, payload));
    if (!done) return;
    const { queryClient, userId } = write;
    const { id } = done.value;
    showUndoToast({ kind: 'saved', ...saved, undo: () => deleteMove(queryClient, userId, id) });
    if (mounted.current) close();
  };

  return (
    <TransferFormView
      state={current}
      context={context}
      picker={picker}
      busy={write.busy}
      error={write.error}
      onState={onState}
      onPicker={setPicker}
      onSubmit={() => void submit()}
    />
  );
}

function TransferFormView({
  state,
  context,
  picker,
  busy,
  error,
  onState,
  onPicker,
  onSubmit,
}: {
  state: TransferState;
  context: TransferContext;
  picker: 'from' | 'to' | null;
  busy: boolean;
  error: string | null;
  onState: (change: (state: TransferState) => TransferState) => void;
  onPicker: (side: 'from' | 'to' | null) => void;
  onSubmit: () => void;
}) {
  const view = transferView(state, context);
  const onKey = useCallback((key: KeypadKey) => onState((current) => pressTransferKey(current, key, context)), [onState, context]);
  useKeypadKeyboard(view.keypadCurrency, onKey, picker === null);
  const focus = (field: TransferField) => onState((current) => focusTransferField(current, field, context));

  return (
    // At least the screen high, the keypad at its foot; on a short screen (375×640) the form grows and scrolls
    // with the page, keeping its bottom padding under the button
    <div className="mx-auto flex min-h-[calc(100dvh-env(safe-area-inset-bottom))] w-full max-w-md flex-col gap-2.5 bg-bg px-4 pb-6 pt-2 text-ink">
      <p role="status" className="sr-only">
        {view.liveText}
      </p>
      <header className="flex h-key shrink-0 items-center gap-3">
        <BackButton />
        <h1 className="type-section min-w-0 flex-1 truncate text-ink">{view.title}</h1>
      </header>

      <section aria-label={view.from.label} className="flex shrink-0 flex-col gap-1 rounded-card bg-card px-4 pb-3.5 pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="type-label font-bold text-ink-muted">{view.from.label}</span>
          <AccountChoice name={view.from.accountName} ariaLabel={view.from.accountAria} onPick={() => onPicker('from')} />
        </div>
        <AmountField amount={view.from.amount} ariaLabel={view.from.amountAria} active={view.from.active} ring={view.from.ring} onFocus={() => focus('out')} />
        <span className={cn('type-label leading-[1.4]', view.from.warning ? 'text-ink' : 'text-ink-muted')}>{view.from.note}</span>
      </section>

      <section aria-label={view.to.label} className="relative flex shrink-0 flex-col gap-1 rounded-card bg-card px-4 pb-3.5 pt-3">
        <button
          type="button"
          onClick={() => onState((current) => swapTransfer(current, context))}
          aria-label="Поменять счета местами"
          className={cn(
            'absolute -top-[27px] left-1/2 z-[1] flex size-touch -translate-x-1/2 items-center justify-center rounded-pill border-4 border-bg bg-card text-ink',
            FOCUS
          )}
        >
          <Icon name="swap" className="size-[18px]" />
        </button>
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span className="type-label font-bold text-ink-muted">{view.to.label}</span>
            {view.to.byCbu && (
              <span className="whitespace-nowrap rounded-pill bg-track px-2.5 py-[3px] text-[12px] font-extrabold text-ink">по курсу ЦБ</span>
            )}
          </span>
          <AccountChoice name={view.to.accountName} ariaLabel={view.to.accountAria} onPick={() => onPicker('to')} />
        </div>
        {view.to.amount && (
          <AmountField amount={view.to.amount} ariaLabel={view.to.amountAria} active={view.to.active} ring={view.to.ring} onFocus={() => focus('in')} />
        )}
        <span className="type-label leading-[1.4] text-ink-muted">{view.to.note}</span>
      </section>

      {view.deal && (
        <section aria-label="Курс сделки" className="flex shrink-0 flex-col gap-0.5 rounded-card bg-track px-4 py-3">
          <span className="text-[15px] font-extrabold">{view.deal.title}</span>
          <span className="type-label leading-[1.45] text-ink-muted">{view.deal.text}</span>
        </section>
      )}
      <p className="type-label mx-1 shrink-0 leading-[1.45] text-ink-muted">{view.note}</p>

      <div className="mt-auto flex shrink-0 flex-col gap-3">
        <Keypad currency={view.keypadCurrency} onKey={onKey} />
        <SheetError text={error} />
        <Button onClick={onSubmit} disabled={!view.button.ready || busy} aria-busy={busy || undefined}>
          {view.button.label}
        </Button>
      </div>

      {(['from', 'to'] as const).map((side) => (
        <AccountPicker
          key={side}
          open={picker === side}
          onOpenChange={(open) => onPicker(open ? side : null)}
          title={view.picker[side].title}
          accounts={view.picker[side].accounts}
          selectedId={view.picker[side].selectedId}
          onSelect={(account) => onState((current) => chooseTransferAccount(current, side, account.id, context))}
        />
      ))}
    </div>
  );
}

/**
 * Transfer and exchange (FT-119, boards «Перевод между счетами», «Обмен сумы → доллары», «Перевод · тёмная»,
 * «Обмен · тёмная»; TransferForm.md) at /accounts/transfer — «Перевод или обмен» on the accounts, «Перевести» /
 * «Обменять» on an account (`?from=`). One form: accounts of one currency make a transfer, of two an exchange
 * «Отдаю / Получаю» with the Central Bank amount first and the deal rate once «Получаю» is typed. A nested screen:
 * «Назад» is Telegram's BackButton or its own and changes nothing.
 */
export function TransferPage() {
  const isGuest = useIsGuest();
  const accounts = useAccounts();
  const rates = useUsdRate();
  const [params] = useSearchParams();
  const close = useCloseScreen();
  const overview = accounts.data;
  // «Получаю» is first counted at the Central Bank rate — the one the accounts were read with until the rates answer
  const context = useMemo<TransferContext | null>(
    () =>
      overview
        ? { accounts: visibleAccounts(overview.accounts), cbuRateMinor: knownRates(rates.data, overview.rate)?.cbu?.rateMinor ?? null }
        : null,
    [overview, rates.data]
  );

  if (isGuest) return <GuestAccounts />;

  if (context) {
    if (context.accounts.length < 2) {
      return (
        <ProblemScreen
          header={<BackButton />}
          icon={<ArrowLeftRight strokeWidth={1.9} />}
          title="Для перевода нужен второй счёт"
          text="Добавьте счёт или покажите скрытый в списке счетов — тогда деньги можно будет перевести."
          action={{ label: 'К счетам', onClick: close }}
        />
      );
    }
    return <TransferForm context={context} fromId={params.get(TRANSFER_FROM_PARAM)} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-2.5 px-4 pt-2 text-ink">
      <header className="flex h-key shrink-0 items-center gap-3">
        <BackButton />
        <h1 className="type-section text-ink">Перевод</h1>
      </header>
      {accounts.isError ? (
        <ReadFailed text="Не удалось загрузить счета." onRetry={() => void accounts.refetch()} retrying={accounts.isFetching} />
      ) : (
        <>
          <LoadingForm />
          <span className="sr-only" role="status">
            Загружаем счета…
          </span>
        </>
      )}
    </div>
  );
}
