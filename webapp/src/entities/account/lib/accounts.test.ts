import { describe, expect, it } from 'vitest';
import type { Account } from '../model/types';
import { defaultRecordAccount } from './accounts';

const account = (overrides: Partial<Account>): Account => ({
  id: 'card', name: 'Карта', kind: 'card', currency: 'UZS', openingBalanceMinor: 0, openingDate: '2026-08-01', isHidden: false, sortOrder: 20, balanceMinor: 0, ...overrides,
});

const CASH = account({ id: 'cash', name: 'Наличные', kind: 'cash', sortOrder: 10 });
const CARD = account({ id: 'card' });
const USD = account({ id: 'usd', name: 'Доллары', kind: 'cash', currency: 'USD', sortOrder: 30 });

/**
 * FT-149: the account a new record goes to, as the server picks it (`accountBook.resolveForRecord`): the chosen default
 * while it is visible, else the first visible account.
 */
describe('defaultRecordAccount', () => {
  it('is the chosen account while it is visible', () => {
    expect(defaultRecordAccount([CASH, CARD, USD], 'card')).toBe(CARD);
    expect(defaultRecordAccount([CASH, CARD, USD], 'usd')).toBe(USD);
  });

  it('is the first visible account when nothing is chosen', () => {
    expect(defaultRecordAccount([CASH, CARD], null)).toBe(CASH);
    expect(defaultRecordAccount([CASH, CARD], undefined)).toBe(CASH);
  });

  it('is the first visible account when the chosen one is hidden or gone', () => {
    const hiddenCard = { ...CARD, isHidden: true };
    expect(defaultRecordAccount([hiddenCard, CASH], 'card')).toBe(CASH);
    expect(defaultRecordAccount([CASH, CARD], 'deleted')).toBe(CASH);
  });

  it('is null without a visible account', () => {
    expect(defaultRecordAccount([], 'card')).toBeNull();
    expect(defaultRecordAccount([{ ...CARD, isHidden: true }], 'card')).toBeNull();
  });
});
