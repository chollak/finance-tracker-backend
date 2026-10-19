import { useEffect, useState } from 'react';
import { useAccounts, type Account } from '@/entities/account';
import { useCategories } from '@/entities/category';
import { useSettings } from '@/entities/settings';
import { useUsdRate } from '@/entities/rate';
import { useUserStore } from '@/entities/user';
import { toLocalDate } from '@/shared/lib/dates';
import { keyFromKeyboard, type KeypadKey } from '@/shared/lib/money';
import { CalendarSheet } from '@/shared/ui/pastel';
import { useSaveManualEntry } from '../api/useSaveManualEntry';
import {
  changeNote,
  chooseAccount,
  chooseCategory,
  chooseDate,
  chooseType,
  entryAccountId,
  entryCurrency,
  initialManualEntry,
  manualEntryModel,
  manualEntryRecord,
  pressEntryKey,
  type EntryContext,
} from '../model/manualEntry';
import { ManualEntryView, type ListStatus } from './ManualEntryView';

const NO_ACCOUNTS: readonly Account[] = [];

const statusOf = (query: { data: unknown; isError: boolean }): ListStatus =>
  query.data !== undefined ? 'ready' : query.isError ? 'failed' : 'loading';

/** Typing goes to the note while it has focus; elsewhere a computer keyboard types the amount. */
function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/**
 * Manual entry (FT-113): the user's accounts, categories and rate, the entry's state, the date in the
 * calendar sheet, and the save. Starts as an expense of today on the default account.
 */
export function ManualEntry() {
  const [today] = useState(() => toLocalDate(new Date()));
  const isGuest = useUserStore((state) => state.userType === 'guest');
  const accountsQuery = useAccounts();
  const categoriesQuery = useCategories();
  const settings = useSettings();
  const rate = useUsdRate();
  const { save, isPending, failed } = useSaveManualEntry();
  const [state, setState] = useState(() => initialManualEntry(today, null));
  const [dateOpen, setDateOpen] = useState(false);

  const accounts = accountsQuery.data?.accounts ?? NO_ACCOUNTS;
  const context: EntryContext = {
    accounts,
    categories: categoriesQuery.data ?? [],
    rateMinor: rate.data?.effective?.rateMinor ?? null,
    today,
  };

  // The account to start on, once the accounts are read: the default one, as the server would pick it
  const startAccountId = state.accountId === null ? entryAccountId(accounts, settings.data?.defaultAccountId) : null;
  if (startAccountId) setState(chooseAccount(state, startAccountId, accounts));

  // From a computer keyboard (Telegram Desktop): the same digits, erase and comma as the keypad
  const currency = entryCurrency(state, accounts);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Not into the note, and not behind the date sheet
      if (dateOpen || event.ctrlKey || event.metaKey || event.altKey || isTextField(event.target)) return;
      const key = keyFromKeyboard(event.key, currency);
      if (!key) return;
      event.preventDefault();
      setState((current) => pressEntryKey(current, key, accounts));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currency, accounts, dateOpen]);

  const onSave = () => {
    const record = manualEntryRecord(state, context);
    if (!record) return;
    void save(record, accounts.find((account) => account.id === record.accountId)?.name);
  };

  const onRetry = () => {
    if (accountsQuery.isError) void accountsQuery.refetch();
    if (categoriesQuery.isError) void categoriesQuery.refetch();
  };

  return (
    <>
      <ManualEntryView
        type={state.type}
        note={state.note}
        model={manualEntryModel(state, context)}
        accounts={isGuest ? 'none' : statusOf(accountsQuery)}
        categories={statusOf(categoriesQuery)}
        saving={isPending}
        saveFailed={failed}
        onType={(type) => setState((current) => chooseType(current, type))}
        onAccount={(accountId) => setState((current) => chooseAccount(current, accountId, accounts))}
        onCategory={(categoryId) => setState((current) => chooseCategory(current, categoryId))}
        onKey={(key: KeypadKey) => setState((current) => pressEntryKey(current, key, accounts))}
        onNote={(note) => setState((current) => changeNote(current, note))}
        onOpenDate={() => setDateOpen(true)}
        onSave={onSave}
        onRetry={onRetry}
      />
      <CalendarSheet
        open={dateOpen}
        onOpenChange={setDateOpen}
        value={state.date}
        today={today}
        onSelect={(date) => setState((current) => chooseDate(current, date))}
      />
    </>
  );
}
