import { defaultAccountOptions, defaultRecordAccount, visibleAccounts, type Account } from '@/entities/account';
import { formatMinor } from '@/shared/lib/money';

/**
 * «Счёт по умолчанию» in «Ещё» (FT-149; SettingsList.md, Picker.md): the account new records in сум go to when they name
 * none — the phrase, manual entry and the starter chips. Only an account in сум can be it (Shukur, 2026-10-29): a record
 * with «$» goes to a dollar account by its currency. The row says which account that is right now, as the server picks
 * it (`accountBook.resolveForRecord`): the chosen one while visible and in сум, else the first visible in сум — and why,
 * when it is not the chosen one. Hidden and dollar accounts are never offered: the server refuses them.
 */

export interface DefaultAccountOption {
  id: string;
  name: string;
  /** «1 250 000 сум». */
  balance: string;
}

export interface DefaultAccountView {
  /** Where a record in сум that names no account goes now; null without a visible account in сум. */
  account: Account | null;
  /** The row's state: «Карта», «Наличные · первый в списке», «Наличные · счёт «Карта» скрыт». */
  state: string;
  /** The visible accounts in сум in their order, with their balance. */
  options: DefaultAccountOption[];
  /** The lines under the choice: why the account is not the chosen one, then what the setting does. */
  notes: string[];
}

/** What the setting does; a record that names an account or another currency goes to that one (`accountBook.ts`). */
export const DEFAULT_ACCOUNT_NOTE = 'Сюда пойдут новые записи в сумах, если в них не назван другой счёт: «нал», «картой»; записи с «$» — на счёт в долларах.';

export interface DefaultAccountNotice {
  title: string;
  detail: string;
}

export const DEFAULT_ACCOUNT_SAVE_FAILED: DefaultAccountNotice = { title: 'Не получилось сменить счёт', detail: 'Проверьте связь и попробуйте ещё раз' };

/** The server refused the account (400): it was hidden or deleted on another device after the list was read. */
export const DEFAULT_ACCOUNT_REFUSED: DefaultAccountNotice = { title: 'Этот счёт больше нельзя выбрать', detail: 'Его скрыли или удалили — выберите другой' };

/** What a save that failed says: the server refused the account, or the answer never came. */
export function defaultAccountSaveNotice(error: { statusCode?: number }): DefaultAccountNotice {
  return error.statusCode === 400 ? DEFAULT_ACCOUNT_REFUSED : DEFAULT_ACCOUNT_SAVE_FAILED;
}

/**
 * Why the chosen account is not where records go, for the row and for the note under the choice: hidden (it is the
 * default again once shown), or in dollars. Null when nothing is chosen or the chosen one is gone.
 */
function skipReason(
  accounts: readonly Account[],
  defaultAccountId: string | null | undefined,
  first: Account
): { state: string; note: string } | null {
  const chosen = accounts.find((item) => item.id === defaultAccountId);
  if (!chosen) return null;
  if (chosen.isHidden) {
    return { state: `счёт «${chosen.name}» скрыт`, note: `Счёт «${chosen.name}» скрыт — записи идут на первый в списке, «${first.name}».` };
  }
  // Saved before FT-149, when the server still took a dollar account
  if (chosen.currency !== 'UZS') {
    return { state: `счёт «${chosen.name}» не в сумах`, note: `Счёт «${chosen.name}» не в сумах — записи в сумах идут на первый в списке, «${first.name}».` };
  }
  return null;
}

export function defaultAccountView(accounts: readonly Account[], defaultAccountId: string | null | undefined): DefaultAccountView {
  const account = defaultRecordAccount(accounts, defaultAccountId);
  const options = defaultAccountOptions(accounts).map((item) => ({ id: item.id, name: item.name, balance: formatMinor(item.balanceMinor, item.currency) }));
  if (!account) {
    return { account: null, state: visibleAccounts(accounts).length > 0 ? 'Нет видимого счёта в сумах' : 'Счетов пока нет', options, notes: [] };
  }

  if (account.id === defaultAccountId) return { account, state: account.name, options, notes: [DEFAULT_ACCOUNT_NOTE] };

  const reason = skipReason(accounts, defaultAccountId, account);
  if (reason) return { account, state: `${account.name} · ${reason.state}`, options, notes: [reason.note, DEFAULT_ACCOUNT_NOTE] };

  // Nothing chosen, or the chosen one is gone: the order of the accounts in сум decides
  return { account, state: `${account.name} · первый в списке`, options, notes: [DEFAULT_ACCOUNT_NOTE] };
}
