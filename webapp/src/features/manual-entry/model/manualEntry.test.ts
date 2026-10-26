import { describe, expect, it } from 'vitest';
import type { Account } from '@/entities/account';
import type { Category } from '@/entities/category';
import { addDays } from '@/shared/lib/dates';
import { MINUS, NBSP, type KeypadKey } from '@/shared/lib/money';
import {
  changeNote,
  chooseAccount,
  chooseCategory,
  chooseDate,
  chooseType,
  entryAccountId,
  initialManualEntry,
  manualEntryModel,
  manualEntryRecord,
  pressEntryKey,
  savedToastDetail,
  type EntryContext,
  type ManualEntryState,
} from './manualEntry';

/**
 * FT-113, boards «Ручной ввод» and «Ручной ввод · тёмная»: the amount on the app's own keypad, «Расход /
 * Доход», the account, the category tiles, the date and a note; one main button that says what is missing.
 */

/** Amounts use non-breaking spaces between digit groups and before the unit. */
const n = (text: string) => text.replace(/(\d) (?=\d|сум|USD)/g, `$1${NBSP}`).replace(/1 USD/, `1${NBSP}USD`);

const TODAY = '2026-10-14';

function account(overrides: Partial<Account>): Account {
  return {
    id: 'card',
    name: 'Карта',
    kind: 'card',
    currency: 'UZS',
    openingBalanceMinor: 0,
    openingDate: '2026-10-01',
    isHidden: false,
    sortOrder: 20,
    balanceMinor: 0,
    ...overrides,
  };
}

const ACCOUNTS: Account[] = [
  account({ id: 'cash', name: 'Наличные', kind: 'cash', sortOrder: 10, balanceMinor: 125_000_000 }),
  account({ id: 'card', name: 'Карта', balanceMinor: 318_000_000 }),
  account({ id: 'usd', name: 'Доллары', kind: 'cash', currency: 'USD', sortOrder: 30, balanceMinor: 42_000 }),
];

const category = (id: string, type: Category['type'], name: string, color: Category['color'], sortOrder: number, extra: Partial<Category> = {}): Category => ({
  id, type, name, color, sortOrder, isHidden: false, isOther: name === 'Другое', presetKey: null, ...extra,
});

const CATEGORIES: Category[] = [
  category('pr', 'expense', 'Продукты', 'peach', 10),
  category('kf', 'expense', 'Кафе', 'rose', 20),
  category('tr', 'expense', 'Транспорт', 'sky', 30),
  category('dm', 'expense', 'Дом', 'sand', 40),
  category('sv', 'expense', 'Связь', 'lilac', 50),
  category('zd', 'expense', 'Здоровье', 'mint', 60),
  category('pk', 'expense', 'Покупки', 'butter', 70),
  category('dr', 'expense', 'Другое', 'mist', 1000),
  category('old', 'expense', 'Скрытая', 'mist', 80, { isHidden: true }),
  category('zp', 'income', 'Зарплата', 'mint', 10),
  category('fr', 'income', 'Фриланс', 'lilac', 20),
  category('dx', 'income', 'Другое', 'mist', 1000),
];

const CONTEXT: EntryContext = { accounts: ACCOUNTS, categories: CATEGORIES, rateMinor: 1_265_000, today: TODAY };

function type(keys: KeypadKey[], state: ManualEntryState, context: EntryContext = CONTEXT): ManualEntryState {
  return keys.reduce((current, key) => pressEntryKey(current, key, context.accounts), state);
}

/** The board: −186 400 сум on «Карта», «Продукты», today. */
function board(): ManualEntryState {
  return chooseCategory(type(['1', '8', '6', '4', '0', '0'], initialManualEntry(TODAY, 'card')), 'pr');
}

describe('starting state', () => {
  it('an expense of today on the default account, nothing typed and no category', () => {
    const state = initialManualEntry(TODAY, 'card');
    const model = manualEntryModel(state, CONTEXT);

    expect(state).toMatchObject({ type: 'expense', accountId: 'card', categoryId: null, date: TODAY, note: '' });
    expect(model.amount).toMatchObject({ text: '0', unit: 'сум', tone: 'placeholder' });
    expect(model.date).toEqual({ label: 'Сегодня', ariaLabel: 'Дата: сегодня, 14 октября' });
    expect(model.save).toEqual({ label: 'Введите сумму', ready: false });
  });

  it('the account is the settings’ default when it is visible, else the first visible one', () => {
    expect(entryAccountId(ACCOUNTS, 'usd')).toBe('usd');
    expect(entryAccountId(ACCOUNTS, null)).toBe('cash');
    expect(entryAccountId([account({ id: 'gone', isHidden: true }), ...ACCOUNTS], 'gone')).toBe('cash');
    // Guests have no accounts
    expect(entryAccountId([], null)).toBeNull();
  });
});

describe('the amount on the keypad', () => {
  it('shows an expense with «−» in ink and an income with «+»', () => {
    const expense = manualEntryModel(board(), CONTEXT);
    expect(expense.amount).toMatchObject({ text: n(`${MINUS}186 400`), unit: 'сум', tone: 'expense', size: 50 });

    const income = manualEntryModel(chooseType(board(), 'income'), CONTEXT);
    expect(income.amount).toMatchObject({ text: n('+186 400'), tone: 'income' });
  });

  it('adds three zeros with «000» and shrinks a long amount instead of wrapping it', () => {
    const state = type(['1', '2', '5', '000', '000'], initialManualEntry(TODAY, 'card'));

    expect(manualEntryModel(state, CONTEXT).amount).toMatchObject({ text: n(`${MINUS}125 000 000`), size: 40 });
  });

  it('says under the amount what it is in the other currency at the rate in effect', () => {
    expect(manualEntryModel(initialManualEntry(TODAY, 'card'), CONTEXT).conversion).toBe(n('1 USD = 12 650 сум'));
    expect(manualEntryModel(board(), CONTEXT).conversion).toBe(n('≈ 14,74 USD'));

    const dollars = type(['4', '2', '0'], chooseAccount(initialManualEntry(TODAY, 'card'), 'usd', ACCOUNTS));
    expect(manualEntryModel(dollars, CONTEXT).conversion).toBe(n('≈ 5 313 000 сум'));
  });

  it('without a rate there is no conversion line', () => {
    expect(manualEntryModel(board(), { ...CONTEXT, rateMinor: null }).conversion).toBeNull();
  });
});

describe('«Расход / Доход»', () => {
  it('switching the type clears the category — income has its own set — and keeps the amount', () => {
    const state = chooseType(board(), 'income');
    const model = manualEntryModel(state, CONTEXT);

    expect(state.categoryId).toBeNull();
    expect(model.categories.map((item) => item.name)).toEqual(['Зарплата', 'Фриланс', 'Другое']);
    expect(model.categoriesTitle).toBe('Категория дохода');
    expect(model.amount.text).toBe(n('+186 400'));
    expect(model.save.label).toBe('Выберите категорию');
  });

  it('pressing the current type keeps the choice', () => {
    expect(chooseType(board(), 'expense').categoryId).toBe('pr');
  });
});

describe('the account', () => {
  it('lists the visible accounts with their balances in their own currencies, the chosen one marked', () => {
    const model = manualEntryModel(board(), CONTEXT);

    expect(model.accounts).toEqual([
      { id: 'cash', name: 'Наличные', balance: n('1 250 000 сум'), selected: false },
      { id: 'card', name: 'Карта', balance: n('3 180 000 сум'), selected: true },
      { id: 'usd', name: 'Доллары', balance: n('420,00 USD'), selected: false },
    ]);
  });

  it('a dollar account types dollars with a comma; the сум amount is not carried over silently', () => {
    const state = chooseAccount(board(), 'usd', ACCOUNTS);
    const model = manualEntryModel(state, CONTEXT);

    expect(model.currency).toBe('USD');
    expect(model.amount).toMatchObject({ text: '0', unit: 'USD', tone: 'placeholder' });

    const typed = manualEntryModel(type(['4', '2', ',', '5', '0', '9'], state), CONTEXT);
    expect(typed.amount.text).toBe(`${MINUS}42,50`);
  });

  it('another account in the same currency keeps the amount', () => {
    expect(manualEntryModel(chooseAccount(board(), 'cash', ACCOUNTS), CONTEXT).amount.text).toBe(n(`${MINUS}186 400`));
  });

  it('before the accounts are read: сум, no account to show', () => {
    const noAccounts = { ...CONTEXT, accounts: [] };
    const model = manualEntryModel(type(['5', '000'], initialManualEntry(TODAY, null), noAccounts), noAccounts);

    expect(model.accounts).toEqual([]);
    expect(model.amount).toMatchObject({ text: n(`${MINUS}5 000`), unit: 'сум' });
  });
});

describe('the category tiles', () => {
  it('offer the visible categories of the type in order, «Другое» last, the chosen one marked', () => {
    const model = manualEntryModel(board(), CONTEXT);

    expect(model.categoriesTitle).toBe('Категория расхода');
    expect(model.categories.map((item) => item.name)).toEqual([
      'Продукты', 'Кафе', 'Транспорт', 'Дом', 'Связь', 'Здоровье', 'Покупки', 'Другое',
    ]);
    expect(model.categories[0]).toEqual({ id: 'pr', name: 'Продукты', color: 'peach', selected: true });
    expect(model.categories.filter((item) => item.selected)).toHaveLength(1);
  });
});

describe('the date', () => {
  it('reads «Вчера» or the day and month, always with the absolute date for screen readers', () => {
    expect(manualEntryModel(chooseDate(board(), addDays(TODAY, -1)), CONTEXT).date).toEqual({
      label: 'Вчера',
      ariaLabel: 'Дата: вчера, 13 октября',
    });
    expect(manualEntryModel(chooseDate(board(), '2026-10-02'), CONTEXT).date).toEqual({
      label: '2 октября',
      ariaLabel: 'Дата: 2 октября',
    });
  });
});

describe('the main button', () => {
  it('says what is missing, then «Сохранить расход» or «Сохранить доход»', () => {
    const noCategory = type(['1', '000'], initialManualEntry(TODAY, 'card'));

    expect(manualEntryModel(noCategory, CONTEXT).save).toEqual({ label: 'Выберите категорию', ready: false });
    // A category without an amount still asks for the amount first
    expect(manualEntryModel(chooseCategory(initialManualEntry(TODAY, 'card'), 'pr'), CONTEXT).save.label).toBe('Введите сумму');
    expect(manualEntryModel(board(), CONTEXT).save).toEqual({ label: 'Сохранить расход', ready: true });
    expect(manualEntryModel(chooseCategory(chooseType(board(), 'income'), 'zp'), CONTEXT).save).toEqual({
      label: 'Сохранить доход',
      ready: true,
    });
  });
});

describe('what is written', () => {
  it('the amount in minor units of the account’s currency, the account, the category, the date and the note', () => {
    const state = changeNote(chooseDate(board(), addDays(TODAY, -1)), '  Супермаркет ');

    expect(manualEntryRecord(state, CONTEXT)).toEqual({
      type: 'expense',
      amountMinor: 18_640_000,
      currency: 'UZS',
      accountId: 'card',
      categoryId: 'pr',
      categoryName: 'Продукты',
      date: '2026-10-13',
      note: 'Супермаркет',
    });
  });

  it('dollars in cents on the dollar account', () => {
    const state = chooseCategory(type(['4', '2', ',', '5'], chooseAccount(initialManualEntry(TODAY, 'card'), 'usd', ACCOUNTS)), 'pk');

    expect(manualEntryRecord(state, CONTEXT)).toMatchObject({ amountMinor: 4_250, currency: 'USD', accountId: 'usd' });
  });

  it('nothing until the amount and the category are there', () => {
    expect(manualEntryRecord(initialManualEntry(TODAY, 'card'), CONTEXT)).toBeNull();
    expect(manualEntryRecord(type(['5'], initialManualEntry(TODAY, 'card')), CONTEXT)).toBeNull();
  });

  it('a note is optional: without one the record has an empty note', () => {
    expect(manualEntryRecord(board(), CONTEXT)?.note).toBe('');
  });
});

describe('the «Записано» toast', () => {
  it('names the note (else the category), the amount with its unit and the account', () => {
    const record = manualEntryRecord(board(), CONTEXT)!;

    expect(savedToastDetail(record, 'Карта')).toBe(n(`Продукты · ${MINUS}186 400 сум · Карта`));
    expect(savedToastDetail({ ...record, note: 'Супермаркет' }, 'Карта')).toBe(n(`Супермаркет · ${MINUS}186 400 сум · Карта`));
    expect(savedToastDetail({ ...record, type: 'income', categoryName: 'Зарплата' }, undefined)).toBe(n('Зарплата · +186 400 сум'));
  });
});
