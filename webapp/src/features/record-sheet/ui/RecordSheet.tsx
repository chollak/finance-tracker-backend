import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAccounts, type Account } from '@/entities/account';
import { useCategories } from '@/entities/category';
import { useUsdRate } from '@/entities/rate';
import { useRecord } from '@/entities/transaction';
import { useUserStore } from '@/entities/user';
import { toLocalDate } from '@/shared/lib/dates';
import { showUndoToast } from '@/shared/lib/undo';
import { keyFromKeyboard, keypadFromMinor, keypadToMinor, pressKey, type KeypadState } from '@/shared/lib/money';
import { AccountPicker, CalendarSheet, CategoryPicker, Sheet } from '@/shared/ui/pastel';
import { useRecordEdits } from '../api/useRecordEdits';
import {
  accountChoices,
  amountEntryModel,
  applyRecalculation,
  categoryChoices,
  changeAmount,
  changeNote,
  chooseAccount,
  chooseCategory,
  chooseDate,
  initialSheet,
  quickPickerContext,
  recordSheetModel,
  sheetRecordFrom,
  type RecordPeriod,
  type SheetContext,
  type SheetFieldKind,
} from '../model/recordSheet';
import { closeRecordSheet, showWholeRecord, useRecordSheetStore, type RecordSheetTarget } from '../model/recordSheetStore';
import { AmountBody, ModeHeader, NoteBody, NoteDone, RecordBody, RecordHeader, RecordLoading, RecordUnavailable } from './RecordSheetView';

const NO_ACCOUNTS: readonly Account[] = [];

type Mode = 'view' | 'amount' | 'note';
type Picker = 'category' | 'account' | 'date' | null;

/** `apiClient` rejects with `{ statusCode }`; a guest's missing record too. */
function isGone(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { statusCode?: unknown }).statusCode === 404;
}

/** The quick choice could not show the record: it closes and says why. */
const UNREADABLE_TOAST = {
  gone: { title: 'Этой операции больше нет', detail: 'Её удалили' },
  failed: { title: 'Не получилось загрузить операцию', detail: 'Проверьте связь' },
} as const;

/**
 * The record sheet (FT-115, TxnSheet.md): mount once on a screen that lists records. It shows the record
 * `openRecordSheet` or `openRecordCategory` named, and nothing otherwise. The sheet belongs to the screen it
 * was opened on: this one takes it, and one opened elsewhere is closed rather than shown here.
 *
 * `period` — the screen lists the records of these days only (a category of a month, FT-121): a record whose date
 * is moved out of them says so as the sheet closes, with «Отменить».
 */
export function RecordSheet({ period }: { period?: RecordPeriod } = {}) {
  const { pathname } = useLocation();
  const target = useRecordSheetStore((state) => state.target);
  const here = target !== null && (target.screen === undefined || target.screen === pathname);

  useEffect(() => {
    if (!target) return;
    if (target.screen === undefined) useRecordSheetStore.setState({ target: { ...target, screen: pathname } });
    else if (target.screen !== pathname) closeRecordSheet();
  }, [target, pathname]);

  return here ? <RecordSheetSession key={target.id} target={target} period={period} /> : null;
}

function RecordSheetSession({ target, period }: { target: RecordSheetTarget; period?: RecordPeriod }) {
  const [today] = useState(() => toLocalDate(new Date()));
  const isGuest = useUserStore((state) => state.userType === 'guest');
  const record = useRecord(target.id, target.seed);
  const gone = record.isError && isGone(record.error);
  // The record as read; until then, or when the read failed (a 5xx, no connection, a 429), the record the list
  // passed in. TanStack drops the placeholder when the read fails, so it is kept here; only a 404 takes it away.
  const source = record.data ?? (gone ? undefined : target.seed);
  const categories = useCategories();
  const accountsQuery = useAccounts();
  const rate = useUsdRate();

  const context: SheetContext = {
    categories: categories.data ?? [],
    // A guest has no accounts: the sheet has no «Счёт»
    accounts: isGuest ? NO_ACCOUNTS : accountsQuery.data?.accounts ?? NO_ACCOUNTS,
    rateMinor: rate.data?.effective?.rateMinor ?? null,
    today,
  };
  const loaded = source ? initialSheet(sheetRecordFrom(source, context.categories)) : null;
  const edits = useRecordEdits(target.id, loaded, context, period);
  const state = edits.state;

  const [mode, setMode] = useState<Mode>('view');
  const [picker, setPicker] = useState<Picker>(null);
  const [keypad, setKeypad] = useState<KeypadState>({ text: '', pristine: false });
  const [noteDraft, setNoteDraft] = useState('');

  // From a computer keyboard (Telegram Desktop): the same digits, erase and comma as the keypad
  const currency = state?.record.currency ?? 'UZS';
  useEffect(() => {
    if (mode !== 'amount') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = keyFromKeyboard(event.key, currency);
      if (!key) return;
      event.preventDefault();
      setKeypad((current) => pressKey(current, key, currency));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, currency]);

  // The quick choice has nothing to show once the read failed without the list's record, or found the record
  // gone: it closes and says so, so the next tap on the circle starts over and reads again.
  const quickUnreadable = target.view === 'category' && !state && record.isError;
  useEffect(() => {
    if (!quickUnreadable) return;
    closeRecordSheet();
    showUndoToast({ kind: 'info', ...(gone ? UNREADABLE_TOAST.gone : UNREADABLE_TOAST.failed) });
  }, [quickUnreadable, gone]);

  // ── The quick choice of a category (a row's circle) ──
  if (target.view === 'category') {
    if (!state) return null;
    const choices = categoryChoices(state, context);
    return (
      <CategoryPicker
        open
        onOpenChange={(open) => {
          if (!open) closeRecordSheet();
        }}
        title={choices.title}
        groups={[{ categories: choices.categories }]}
        selectedId={choices.selectedId}
        onSelect={(category) => void edits.quickCategory(category.id)}
        context={{ text: quickPickerContext(state.record), onOpenOperation: showWholeRecord }}
      />
    );
  }

  // ── The whole sheet ──
  const model = state ? recordSheetModel(state, context) : null;

  const onOpenChange = (open: boolean) => {
    if (open) return;
    // The scrim, Escape or a drag in the amount or the note goes back to the record, not out of it
    if (mode !== 'view') setMode('view');
    else edits.close();
  };

  const openField = (kind: SheetFieldKind) => {
    if (!state) return;
    if (kind === 'note') {
      setNoteDraft(state.record.note);
      setMode('note');
    } else {
      setPicker(kind);
    }
  };

  const openAmount = () => {
    if (!state) return;
    setKeypad(keypadFromMinor(state.record.amountMinor, state.record.currency));
    setMode('amount');
  };

  const commitAmount = () => {
    if (!state) return;
    const minor = keypad.pristine ? null : keypadToMinor(keypad, state.record.currency);
    if (!keypad.pristine && minor === null) return;
    setMode('view');
    if (minor !== null) void edits.apply((current) => changeAmount(current, minor));
  };

  const commitNote = () => {
    setMode('view');
    void edits.apply((current) => changeNote(current, noteDraft));
  };

  let title = model?.dialogLabel ?? 'Операция';
  let header = model && <RecordHeader type={model.type} onType={(type) => edits.chooseType(type) && setPicker('category')} onClose={edits.close} />;
  let body;
  if (!state || !model) {
    body = record.isError ? (
      <RecordUnavailable gone={gone} onRetry={() => void record.refetch()} onClose={closeRecordSheet} />
    ) : (
      <RecordLoading />
    );
  } else if (mode === 'amount') {
    title = 'Изменить сумму';
    header = <ModeHeader title="Сумма" onBack={() => setMode('view')} />;
    body = (
      <AmountBody
        model={amountEntryModel(state.record, keypad, context.rateMinor)}
        currency={state.record.currency}
        onKey={(key) => setKeypad((current) => pressKey(current, key, state.record.currency))}
        onDone={commitAmount}
      />
    );
  } else if (mode === 'note') {
    title = 'Изменить заметку';
    header = <ModeHeader title="Заметка" onBack={() => setMode('view')} action={<NoteDone onDone={commitNote} />} />;
    body = <NoteBody value={noteDraft} onChange={setNoteDraft} onDone={commitNote} />;
  } else {
    body = (
      <RecordBody
        model={model}
        status={edits.status}
        deleting={edits.deleting}
        onAmount={openAmount}
        onField={openField}
        onRecalculate={() => void edits.apply(applyRecalculation)}
        onDone={edits.close}
        onDelete={() => void edits.remove()}
      />
    );
  }

  const closePicker = (open: boolean) => {
    if (open) return;
    if (picker === 'category') edits.leaveCategoryChoice();
    setPicker(null);
  };
  const choices = state ? categoryChoices(state, context) : null;

  return (
    <>
      <Sheet open onOpenChange={onOpenChange} title={title} header={header ?? undefined}>
        {body}
      </Sheet>

      {state && choices && (
        <>
          <CategoryPicker
            open={picker === 'category'}
            onOpenChange={closePicker}
            title={choices.title}
            groups={[{ categories: choices.categories }]}
            selectedId={choices.selectedId}
            onSelect={(category) => void edits.apply((current) => chooseCategory(current, category.id))}
          />
          <AccountPicker
            open={picker === 'account'}
            onOpenChange={closePicker}
            accounts={accountChoices(context)}
            selectedId={state.record.accountId}
            onSelect={(choice) => {
              const account = context.accounts.find((item) => item.id === choice.id);
              if (account) void edits.apply((current) => chooseAccount(current, account, context.rateMinor));
            }}
          />
          <CalendarSheet
            open={picker === 'date'}
            onOpenChange={closePicker}
            value={state.record.date}
            today={today}
            onSelect={(date) => void edits.apply((current) => chooseDate(current, date))}
          />
        </>
      )}
    </>
  );
}
