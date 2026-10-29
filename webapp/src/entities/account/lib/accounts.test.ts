import { describe, expect, it } from 'vitest';
import type { Account } from '../model/types';
import { defaultAccountOptions, defaultRecordAccount } from './accounts';

const account = (overrides: Partial<Account>): Account => ({
  id: 'card', name: 'Карта', kind: 'card', currency: 'UZS', openingBalanceMinor: 0, openingDate: '2026-08-01', isHidden: false, sortOrder: 20, balanceMinor: 0, ...overrides,
});

const CASH = account({ id: 'cash', name: 'Наличные', kind: 'cash', sortOrder: 10 });
const CARD = account({ id: 'card' });
const USD = account({ id: 'usd', name: 'Доллары', kind: 'cash', currency: 'USD', sortOrder: 30 });

/**
 * FT-149: the account a new record in сум goes to when it names none, as the server picks it
 * (`accountBook.resolveForRecord`): the chosen default while it is visible and in сум, else the first visible account in
 * сум. A record with «$» goes to a dollar account by its currency, so only an account in сум can be the default.
 */
describe('defaultRecordAccount', () => {
  it('is the chosen account while it is visible', () => {
    expect(defaultRecordAccount([CASH, CARD, USD], 'card')).toBe(CARD);
  });

  it('is the first visible account in сум when nothing is chosen', () => {
    expect(defaultRecordAccount([CASH, CARD], null)).toBe(CASH);
    expect(defaultRecordAccount([CASH, CARD], undefined)).toBe(CASH);
    // A dollar account listed first is not where a record in сум goes
    expect(defaultRecordAccount([USD, CARD, CASH], null)).toBe(CARD);
  });

  it('is the first visible account in сум when the chosen one is hidden, gone or in dollars', () => {
    const hiddenCard = { ...CARD, isHidden: true };
    expect(defaultRecordAccount([hiddenCard, CASH], 'card')).toBe(CASH);
    expect(defaultRecordAccount([CASH, CARD], 'deleted')).toBe(CASH);
    // Saved before FT-149, when the server still took it
    expect(defaultRecordAccount([USD, CASH, CARD], 'usd')).toBe(CASH);
  });

  it('is null without a visible account in сум', () => {
    expect(defaultRecordAccount([], 'card')).toBeNull();
    expect(defaultRecordAccount([{ ...CARD, isHidden: true }], 'card')).toBeNull();
    expect(defaultRecordAccount([USD], 'usd')).toBeNull();
  });
});

describe('defaultAccountOptions', () => {
  it('are the visible accounts in сум, in their order', () => {
    expect(defaultAccountOptions([USD, CARD, { ...CASH, isHidden: true }, CASH]).map((item) => item.id)).toEqual(['card', 'cash']);
  });
});
