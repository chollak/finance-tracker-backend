import { describe, expect, it } from 'vitest';
import type { Account } from '@/entities/account';
import { NBSP } from '@/shared/lib/money';
import { DEFAULT_ACCOUNT_NOTE, DEFAULT_ACCOUNT_REFUSED, DEFAULT_ACCOUNT_SAVE_FAILED, defaultAccountSaveNotice, defaultAccountView } from './defaultAccount';

const account = (overrides: Partial<Account>): Account => ({
  id: 'card', name: 'Карта', kind: 'card', currency: 'UZS', openingBalanceMinor: 0, openingDate: '2026-08-01', isHidden: false, sortOrder: 20, balanceMinor: 0, ...overrides,
});

const CASH = account({ id: 'cash', name: 'Наличные', kind: 'cash', sortOrder: 10, balanceMinor: 125_000_000 });
const CARD = account({ id: 'card', balanceMinor: 318_000_000 });
const USD = account({ id: 'usd', name: 'Доллары', kind: 'cash', currency: 'USD', sortOrder: 30, balanceMinor: 42_000 });
const OLD = account({ id: 'old', name: 'Старая карта', isHidden: true, sortOrder: 40 });
const ACCOUNTS = [CASH, CARD, USD, OLD];

/**
 * FT-149: «Счёт по умолчанию» in «Ещё» (SettingsList.md: the row says its state; Picker.md: the accounts with their
 * balance and a radio). The account named is where new records go, as the server picks it (`accountBook.ts`): the
 * chosen one while visible, else the first visible — and the row says why when it is not the chosen one.
 */
describe('defaultAccountView', () => {
  it('names the chosen account', () => {
    const view = defaultAccountView(ACCOUNTS, 'card');

    expect(view.account?.id).toBe('card');
    expect(view.state).toBe('Карта');
    expect(view.notes).toEqual([DEFAULT_ACCOUNT_NOTE]);
  });

  it('offers only the visible accounts, with their balance, in their order', () => {
    const view = defaultAccountView(ACCOUNTS, 'card');

    expect(view.options).toEqual([
      { id: 'cash', name: 'Наличные', balance: `1${NBSP}250${NBSP}000${NBSP}сум` },
      { id: 'card', name: 'Карта', balance: `3${NBSP}180${NBSP}000${NBSP}сум` },
      { id: 'usd', name: 'Доллары', balance: `420,00${NBSP}USD` },
    ]);
  });

  it('with nothing chosen, names the first visible account and says it is the first in the list', () => {
    const view = defaultAccountView(ACCOUNTS, null);

    expect(view.account?.id).toBe('cash');
    expect(view.state).toBe('Наличные · первый в списке');
    expect(view.notes).toEqual([DEFAULT_ACCOUNT_NOTE]);
  });

  it('a chosen account that is gone counts as nothing chosen', () => {
    expect(defaultAccountView(ACCOUNTS, 'deleted').state).toBe('Наличные · первый в списке');
  });

  it('when the chosen account is hidden, names the first visible one and says the chosen one is hidden', () => {
    const view = defaultAccountView(ACCOUNTS, 'old');

    expect(view.account?.id).toBe('cash');
    expect(view.state).toBe('Наличные · счёт «Старая карта» скрыт');
    expect(view.notes).toEqual(['Счёт «Старая карта» скрыт — записи идут на первый в списке, «Наличные».', DEFAULT_ACCOUNT_NOTE]);
    // The hidden one is never offered
    expect(view.options.map((option) => option.id)).toEqual(['cash', 'card', 'usd']);
  });

  it('without a visible account there is nothing to choose', () => {
    const view = defaultAccountView([], null);

    expect(view.account).toBeNull();
    expect(view.state).toBe('Счетов пока нет');
    expect(view.options).toEqual([]);
  });
});

describe('defaultAccountSaveNotice', () => {
  it('a refusal of the server (the account was hidden or deleted elsewhere) is not a connection problem', () => {
    expect(defaultAccountSaveNotice({ statusCode: 400 })).toEqual(DEFAULT_ACCOUNT_REFUSED);
    expect(DEFAULT_ACCOUNT_REFUSED.detail).not.toContain('связь');
  });

  it('no answer, or the server failing, asks to check the connection and try again', () => {
    expect(defaultAccountSaveNotice({ statusCode: 0 })).toEqual(DEFAULT_ACCOUNT_SAVE_FAILED);
    expect(defaultAccountSaveNotice({ statusCode: 500 })).toEqual(DEFAULT_ACCOUNT_SAVE_FAILED);
    expect(defaultAccountSaveNotice({})).toEqual(DEFAULT_ACCOUNT_SAVE_FAILED);
  });
});
