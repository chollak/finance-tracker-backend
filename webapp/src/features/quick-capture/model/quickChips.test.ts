import { describe, expect, it } from 'vitest';
import type { Account } from '@/entities/account';
import type { Category } from '@/entities/category';
import type { FrequentRecord } from '@/entities/transaction';
import { MINUS, NBSP } from '@/shared/lib/money';
import { quickChips, quickChipSavedDetail, STARTER_CHIPS } from './quickChips';

/**
 * FT-114, board «Главная» and Composer.md «Частые операции»: chips over the input write a frequent expense
 * in one tap. Which ones: the server's frequent expenses (the rule is a constant there); a newcomer without
 * them gets the four starters of the prototype.
 */

function category(id: string, name: string, color: Category['color'], presetKey: string | null, overrides: Partial<Category> = {}): Category {
  return { id, type: 'expense', name, color, isHidden: false, isOther: false, sortOrder: 10, presetKey, ...overrides };
}

const CATEGORIES: Category[] = [
  category('c-gro', 'Продукты', 'peach', 'groceries'),
  category('c-cafe', 'Кафе', 'rose', 'cafe'),
  category('c-tr', 'Транспорт', 'sky', 'transport'),
  category('c-other', 'Другое', 'mist', 'other', { isOther: true }),
];

function account(id: string, name: string, overrides: Partial<Account> = {}): Account {
  return {
    id, name, kind: 'card', currency: 'UZS', openingBalanceMinor: 0, openingDate: '2026-10-01', isHidden: false,
    sortOrder: 10, balanceMinor: 0, ...overrides,
  };
}

const ACCOUNTS = [account('card', 'Карта'), account('cash', 'Наличные', { kind: 'cash' }), account('usd', 'Доллары', { currency: 'USD' })];

function frequent(overrides: Partial<FrequentRecord>): FrequentRecord {
  return { categoryId: 'c-cafe', note: 'Кофе', amountMinor: 2_500_000, currency: 'UZS', accountId: 'card', count: 3, ...overrides };
}

describe('the starters for a newcomer', () => {
  it('are the four of the prototype: Кофе 25 000, Такси 18 000, Обед 45 000, Продукты 150 000', () => {
    expect(STARTER_CHIPS).toEqual([
      { note: 'Кофе', amountMinor: 2_500_000, presetKey: 'cafe' },
      { note: 'Такси', amountMinor: 1_800_000, presetKey: 'transport' },
      { note: 'Обед', amountMinor: 4_500_000, presetKey: 'cafe' },
      { note: 'Продукты', amountMinor: 15_000_000, presetKey: 'groceries' },
    ]);
  });

  it('show when there is no frequent expense yet, in the colour of the user’s own category', () => {
    const chips = quickChips({ frequent: [], categories: CATEGORIES, accounts: ACCOUNTS, defaultAccountId: 'card' });

    expect(chips.map((chip) => [chip.name, chip.amount, chip.color])).toEqual([
      ['Кофе', `25${NBSP}000`, 'rose'],
      ['Такси', `18${NBSP}000`, 'sky'],
      ['Обед', `45${NBSP}000`, 'rose'],
      ['Продукты', `150${NBSP}000`, 'peach'],
    ]);
    expect(chips[0].record).toEqual({
      categoryId: 'c-cafe', categoryName: 'Кафе', note: 'Кофе', amountMinor: 2_500_000, currency: 'UZS', accountId: 'card', accountName: 'Карта',
    });
  });

  it('go to the default account, or the first visible one without it; a guest has no accounts', () => {
    const [onCash] = quickChips({ frequent: [], categories: CATEGORIES, accounts: ACCOUNTS, defaultAccountId: 'cash' });
    const [onFirst] = quickChips({ frequent: [], categories: CATEGORIES, accounts: ACCOUNTS, defaultAccountId: null });
    const [guest] = quickChips({ frequent: [], categories: CATEGORIES, accounts: [], defaultAccountId: null });

    expect(onCash.record).toMatchObject({ accountId: 'cash', accountName: 'Наличные' });
    expect(onFirst.record).toMatchObject({ accountId: 'card', accountName: 'Карта' });
    expect(guest.record.accountId).toBeUndefined();
    expect(guest.record.accountName).toBeUndefined();
  });

  it('follow a renamed category and leave out one the user hid', () => {
    const categories = CATEGORIES.map((item) =>
      item.presetKey === 'cafe' ? { ...item, name: 'Кофейни' } : item.presetKey === 'transport' ? { ...item, isHidden: true } : item
    );

    const chips = quickChips({ frequent: [], categories, accounts: ACCOUNTS, defaultAccountId: 'card' });

    expect(chips.map((chip) => chip.name)).toEqual(['Кофе', 'Обед', 'Продукты']);
    expect(chips[0].record.categoryName).toBe('Кофейни');
  });

  it('say what a tap does', () => {
    expect(quickChips({ frequent: [], categories: CATEGORIES, accounts: ACCOUNTS, defaultAccountId: 'card' })[0].aria).toBe(`Записать сразу: Кофе, 25${NBSP}000${NBSP}сум`);
  });
});

describe('the frequent expenses', () => {
  it('take the place of the starters, in the server’s order, named by their note', () => {
    const chips = quickChips({
      frequent: [frequent({ note: 'Такси', categoryId: 'c-tr', amountMinor: 1_800_000, count: 9 }), frequent({ note: 'Кофе', count: 4 })],
      categories: CATEGORIES,
      accounts: ACCOUNTS,
      defaultAccountId: 'card',
    });

    expect(chips.map((chip) => [chip.name, chip.amount, chip.color])).toEqual([
      ['Такси', `18${NBSP}000`, 'sky'],
      ['Кофе', `25${NBSP}000`, 'rose'],
    ]);
  });

  it('are named by the category when written without a note', () => {
    expect(quickChips({ frequent: [frequent({ note: '' })], categories: CATEGORIES, accounts: ACCOUNTS, defaultAccountId: 'card' })[0].name).toBe('Кафе');
  });

  it('write to the account they were written to, while it is visible', () => {
    const [onCash] = quickChips({ frequent: [frequent({ accountId: 'cash' })], categories: CATEGORIES, accounts: ACCOUNTS, defaultAccountId: 'card' });
    const hidden = ACCOUNTS.map((item) => (item.id === 'cash' ? { ...item, isHidden: true } : item));
    const [onHidden] = quickChips({ frequent: [frequent({ accountId: 'cash' })], categories: CATEGORIES, accounts: hidden, defaultAccountId: 'card' });

    expect(onCash.record).toMatchObject({ accountId: 'cash', accountName: 'Наличные' });
    // A hidden account takes no records: the default one does
    expect(onHidden.record).toMatchObject({ accountId: 'card', accountName: 'Карта' });
  });

  it('keep dollars in dollars', () => {
    const subscription = frequent({ note: 'Подписка', currency: 'USD', amountMinor: 999, accountId: 'old-usd' });
    const [chip] = quickChips({ frequent: [subscription], categories: CATEGORIES, accounts: ACCOUNTS, defaultAccountId: 'card' });
    const [none] = quickChips({
      frequent: [subscription, frequent({})], categories: CATEGORIES, accounts: ACCOUNTS.filter((item) => item.currency === 'UZS'), defaultAccountId: 'card',
    });

    expect(chip.amount).toBe('9,99');
    expect(chip.aria).toBe(`Записать сразу: Подписка, 9,99${NBSP}USD`);
    // Its account is gone: another dollar account, never the сум default
    expect(chip.record).toMatchObject({ currency: 'USD', amountMinor: 999, accountId: 'usd', accountName: 'Доллары' });
    // No dollar account any more: the chip is not offered
    expect(none.name).toBe('Кофе');
  });

  it('leave out one whose category is gone or hidden', () => {
    const chips = quickChips({
      frequent: [frequent({ categoryId: 'deleted' }), frequent({ categoryId: 'c-tr', note: 'Такси' }), frequent({ note: 'Латте' })],
      categories: CATEGORIES.map((item) => (item.id === 'c-tr' ? { ...item, isHidden: true } : item)),
      accounts: ACCOUNTS,
      defaultAccountId: 'card',
    });

    expect(chips.map((chip) => chip.name)).toEqual(['Латте']);
  });

  it('give way to the starters when none of them is left', () => {
    const chips = quickChips({ frequent: [frequent({ categoryId: 'deleted' })], categories: CATEGORIES, accounts: ACCOUNTS, defaultAccountId: 'card' });

    expect(chips.map((chip) => chip.name)).toEqual(['Кофе', 'Такси', 'Обед', 'Продукты']);
  });

  it('are not drawn while still being read: the starters would jump to other chips', () => {
    expect(quickChips({ frequent: undefined, categories: CATEGORIES, accounts: ACCOUNTS, defaultAccountId: 'card' })).toEqual([]);
  });
});

describe('«Записано» after a chip', () => {
  it('says what was written, with the sign, the unit and the account (Toast.md)', () => {
    const [chip] = quickChips({ frequent: [], categories: CATEGORIES, accounts: ACCOUNTS, defaultAccountId: 'card' });
    const [guest] = quickChips({ frequent: [], categories: CATEGORIES, accounts: [], defaultAccountId: null });

    expect(quickChipSavedDetail(chip.record)).toBe(`Кофе · ${MINUS}25${NBSP}000${NBSP}сум · Карта`);
    expect(quickChipSavedDetail(guest.record)).toBe(`Кофе · ${MINUS}25${NBSP}000${NBSP}сум`);
  });
});
