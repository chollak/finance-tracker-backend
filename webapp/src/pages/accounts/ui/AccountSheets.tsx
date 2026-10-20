import { useCallback, useState } from 'react';
import { adjustBalance, deleteMove, restoreMove, updateAccount, type Account, type AccountPatch, type MoveOperation } from '@/entities/account';
import type { LocalDate } from '@/shared/lib/dates';
import { emptyKeypad, formatMinor, pressKey, type KeypadKey, type KeypadState } from '@/shared/lib/money';
import { showUndoToast } from '@/shared/lib/undo';
import { Button, Keypad, Segmented, Sheet } from '@/shared/ui/pastel';
import { CURRENCY_OPTIONS, correctBalanceView, editAccountDraft, editAccountView, type EditAccountDraft } from '../model/accountForms';
import { moveDetails } from '../model/accountScreen';
import { AmountCard, NameField, SheetField, SheetSecondaryButton } from './parts';
import { useKeypadKeyboard } from './useKeypadKeyboard';
import { SheetError } from './ListSheets';
import { useAccountWrite } from './useAccountWrite';

type AccountOnScreen = Account & { hasOperations: boolean };

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * «Изменить» (board «Изменить или скрыть счёт»): the name; the currency, which is locked once the account has
 * operations and otherwise changes with the balance entered again; the opening balance with its date; «Сохранить»;
 * and «Скрыть счёт» saying how much leaves the total. Every change comes with «Отменить». Hiding returns to the
 * list; the last visible account cannot be hidden.
 */
export function EditAccountSheet({
  open,
  onOpenChange,
  account,
  visibleCount,
  rateMinor,
  today,
  onHidden,
}: SheetProps & {
  account: AccountOnScreen;
  visibleCount: number;
  rateMinor: number | null;
  today: LocalDate;
  /** The account is hidden: its screen gives way to the list. */
  onHidden: () => void;
}) {
  const [draft, setDraft] = useState<EditAccountDraft>(() => editAccountDraft(account));
  const write = useAccountWrite();
  const view = editAccountView(account, draft, { today, visibleCount, rateMinor });

  const onKey = useCallback((key: KeypadKey) => setDraft((current) => ({ ...current, amount: pressKey(current.amount, key, current.currency) })), []);
  useKeypadKeyboard(draft.currency, onKey, open && view.currency.changed);

  const save = async () => {
    if (!view.button.ready || write.busy) return;
    const change = view.change;
    if (!change) {
      onOpenChange(false);
      return;
    }
    const done = await write.run((queryClient, userId) => updateAccount(queryClient, userId, account.id, change.patch));
    if (!done) return;
    onOpenChange(false);
    const { queryClient, userId } = write;
    showUndoToast({
      kind: 'changed',
      title: 'Счёт изменён',
      detail: change.detail,
      undo: () => updateAccount(queryClient, userId, account.id, change.undo).then(() => undefined),
    });
  };

  const toggleHidden = async () => {
    const hide = view.hide;
    if (!hide?.available || write.busy) return;
    const hiding = hide.action === 'hide';
    const patch: AccountPatch = { isHidden: hiding };
    const done = await write.run((queryClient, userId) => updateAccount(queryClient, userId, account.id, patch));
    if (!done) return;
    onOpenChange(false);
    if (hiding) onHidden();
    const { queryClient, userId } = write;
    showUndoToast({
      kind: 'changed',
      title: hiding ? 'Счёт скрыт' : 'Счёт снова виден',
      detail: hiding ? `${account.name} · вернуть — в «Скрытых счетах»` : `${account.name} · ${formatMinor(account.balanceMinor, account.currency)}`,
      undo: () => updateAccount(queryClient, userId, account.id, { isHidden: !hiding }).then(() => undefined),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={view.title}>
      <NameField
        value={draft.name}
        onChange={(name) => {
          write.clearError();
          setDraft((current) => ({ ...current, name }));
        }}
      />
      <div className="flex shrink-0 flex-col rounded-card bg-sheet-card px-4">
        {view.currency.locked ? (
          <SheetField label="Валюта">
            <span className="type-body-strong text-ink">{view.currency.text}</span>
            <span className="type-label leading-[1.45] text-ink-muted">Не изменить: на счёте уже есть операции.</span>
          </SheetField>
        ) : (
          <SheetField label="Валюта" className="gap-2">
            <Segmented
              options={CURRENCY_OPTIONS}
              value={draft.currency}
              onChange={(currency) => setDraft((current) => ({ ...current, currency, amount: emptyKeypad() }))}
              ariaLabel="Валюта счёта"
              className="bg-sheet-track"
            />
          </SheetField>
        )}
        {view.initialText && (
          <SheetField label="Начальный остаток" className="border-t border-line">
            <span className="type-body-strong tabular-nums text-ink">{view.initialText}</span>
          </SheetField>
        )}
      </div>
      {view.amount && (
        <>
          <AmountCard label="Сколько на нём сейчас" amount={view.amount} note={view.amountNote} />
          <Keypad currency={draft.currency} state={draft.amount} onChange={(amount) => setDraft((current) => ({ ...current, amount }))} inSheet className="shrink-0" />
        </>
      )}
      <SheetError text={write.error} />
      <Button inSheet onClick={() => void save()} disabled={!view.button.ready || write.busy} aria-busy={write.busy || undefined}>
        {view.button.label}
      </Button>
      {view.hide && (
        <div className="flex shrink-0 flex-col gap-1.5">
          <SheetSecondaryButton icon="hide" onClick={() => void toggleHidden()} disabled={!view.hide.available} busy={write.busy}>
            {view.hide.action === 'hide' ? 'Скрыть счёт' : 'Показать счёт'}
          </SheetSecondaryButton>
          <p className="type-label mx-1 leading-[1.45] text-ink-muted">{view.hide.note}</p>
        </div>
      )}
    </Sheet>
  );
}

/**
 * «Сверить остаток» (board «Сверить остаток»): what is really on the account, typed on the app's keypad. The balance
 * Daftar has is the grey hint until then; the difference is recorded as an adjustment — not a quiet change of the
 * balance — with «Отменить». An empty field and the same balance keep the button off.
 */
export function CorrectBalanceSheet({ open, onOpenChange, account }: SheetProps & { account: AccountOnScreen }) {
  const [amount, setAmount] = useState<KeypadState>(emptyKeypad);
  const write = useAccountWrite();
  const view = correctBalanceView(account, amount);

  const onKey = useCallback((key: KeypadKey) => setAmount((current) => pressKey(current, key, account.currency)), [account.currency]);
  useKeypadKeyboard(account.currency, onKey, open);

  const save = async () => {
    const { balanceMinor, saved } = view;
    if (balanceMinor === null || !saved || write.busy) return;
    const done = await write.run((queryClient, userId) => adjustBalance(queryClient, userId, { accountId: account.id, balanceMinor }));
    if (!done) return;
    onOpenChange(false);
    const { queryClient, userId } = write;
    const { id } = done.value;
    showUndoToast({ kind: 'saved', ...saved, undo: () => deleteMove(queryClient, userId, id) });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={view.title}>
      <AmountCard label="Точный остаток" amount={view.amount} note={view.note} />
      <Keypad currency={account.currency} state={amount} onChange={setAmount} inSheet className="shrink-0" />
      <SheetError text={write.error} />
      <Button inSheet onClick={() => void save()} disabled={!view.button.ready || write.busy} aria-busy={write.busy || undefined}>
        {view.button.label}
      </Button>
    </Sheet>
  );
}

/**
 * «Подробнее» of a transfer, an exchange or an adjustment (board «Обмен · подробнее и удаление», AccountMoves.md):
 * what moved where, the deal rate of an exchange, one line on what deleting does, and the delete as the secondary
 * button — this sheet has no main one. Deleting brings both balances back, with «Отменить».
 */
export function MoveSheet({
  open,
  onOpenChange,
  operation,
  account,
  today,
}: SheetProps & { operation: MoveOperation; account: Account; today: LocalDate }) {
  const write = useAccountWrite();
  const details = moveDetails(operation, account, today);

  const remove = async () => {
    if (write.busy) return;
    const done = await write.run((queryClient, userId) => deleteMove(queryClient, userId, operation.id));
    if (!done) return;
    onOpenChange(false);
    const { queryClient, userId } = write;
    showUndoToast({ kind: 'deleted', ...details.deleted, undo: () => restoreMove(queryClient, userId, operation.id) });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={details.title}>
      <ul className="shrink-0 rounded-card bg-sheet-card px-4 [&>*+*]:border-t [&>*+*]:border-line">
        {details.rows.map((row) => (
          <li key={row.label} className="flex min-h-14 flex-col justify-center gap-0.5 py-2">
            <span className="type-label font-bold text-ink-muted">{row.label}</span>
            <span className="type-body-strong tabular-nums text-ink">{row.value}</span>
          </li>
        ))}
      </ul>
      <p className="type-label mx-1 shrink-0 leading-[1.45] text-ink-muted">{details.note}</p>
      <SheetError text={write.error && 'Не получилось удалить. Проверьте связь и нажмите ещё раз'} />
      <SheetSecondaryButton icon="trash" onClick={() => void remove()} busy={write.busy}>
        {details.deleteLabel}
      </SheetSecondaryButton>
    </Sheet>
  );
}
