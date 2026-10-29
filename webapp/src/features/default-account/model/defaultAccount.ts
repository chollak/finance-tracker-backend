import { defaultRecordAccount, visibleAccounts, type Account } from '@/entities/account';
import { formatMinor } from '@/shared/lib/money';

/**
 * «Счёт по умолчанию» in «Ещё» (FT-149; SettingsList.md, Picker.md): the account new records go to when they name
 * none — the phrase, manual entry and the starter chips. The row says which account that is right now, as the server
 * picks it (`accountBook.resolveForRecord`): the chosen one while visible, else the first visible — and why, when it is
 * not the chosen one. A hidden account is never offered: the server refuses it.
 */

export interface DefaultAccountOption {
  id: string;
  name: string;
  /** «1 250 000 сум», «420,00 USD». */
  balance: string;
}

export interface DefaultAccountView {
  /** Where a record that names no account goes now; null without a visible account. */
  account: Account | null;
  /** The row's state: «Карта», «Наличные · первый в списке», «Наличные · счёт «Карта» скрыт». */
  state: string;
  /** The visible accounts in their order, with their balance. */
  options: DefaultAccountOption[];
  /** The lines under the choice: why the account is not the chosen one, then what the setting does. */
  notes: string[];
}

/** What the setting does; a record that names an account or a currency goes to that one (`accountBook.ts`). */
export const DEFAULT_ACCOUNT_NOTE = 'Сюда пойдут новые записи, если в них не назван другой счёт или валюта: «нал», «картой», «55$».';

export const DEFAULT_ACCOUNT_SAVE_FAILED = { title: 'Не получилось сменить счёт', detail: 'Проверьте связь и попробуйте ещё раз' } as const;

export function defaultAccountView(accounts: readonly Account[], defaultAccountId: string | null | undefined): DefaultAccountView {
  const account = defaultRecordAccount(accounts, defaultAccountId);
  const options = visibleAccounts(accounts).map((item) => ({ id: item.id, name: item.name, balance: formatMinor(item.balanceMinor, item.currency) }));
  if (!account) return { account: null, state: 'Счетов пока нет', options, notes: [] };

  if (account.id === defaultAccountId) return { account, state: account.name, options, notes: [DEFAULT_ACCOUNT_NOTE] };

  // The chosen one is hidden: the setting stays, and it is the default again once the account is shown
  const hidden = accounts.find((item) => item.id === defaultAccountId && item.isHidden);
  if (hidden) {
    return {
      account,
      state: `${account.name} · счёт «${hidden.name}» скрыт`,
      options,
      notes: [`Счёт «${hidden.name}» скрыт — записи идут на первый в списке, «${account.name}».`, DEFAULT_ACCOUNT_NOTE],
    };
  }

  // Nothing chosen, or the chosen one is gone: the order of the accounts decides
  return { account, state: `${account.name} · первый в списке`, options, notes: [DEFAULT_ACCOUNT_NOTE] };
}
