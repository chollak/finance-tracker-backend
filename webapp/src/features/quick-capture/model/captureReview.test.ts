import { describe, expect, it } from 'vitest';
import type { Account } from '@/entities/account';
import type { Category } from '@/entities/category';
import { addDays, toLocalDate } from '@/shared/lib/dates';
import { MINUS, NBSP } from '@/shared/lib/money';
import type { CapturedTransaction, QuickCaptureResult } from './types';
import {
  accountChoices,
  applyConversion,
  capturedToast,
  categoryChoices,
  chooseAccount,
  chooseCategory,
  chooseDate,
  liveItems,
  removedToast,
  removeItem,
  restoreItem,
  reviewModel,
  reviewSessionFrom,
  type ReviewContext,
  type ReviewSession,
} from './captureReview';

/**
 * FT-114, boards «Проверка записей» and «Проверка · категория под вопросом»: several records of one phrase
 * are checked on one screen. The AI's guess of a category is «Кафе ?» until it is confirmed or changed in
 * the picker; «"45" понял как 45 000 сум» comes from the capture's `assumptions`; every change is a patch
 * of the record already saved.
 */

const TODAY = toLocalDate(new Date(2026, 9, 14));
const YESTERDAY = addDays(TODAY, -1);

function category(id: string, type: Category['type'], name: string, color: Category['color'], presetKey: string): Category {
  return { id, type, name, color, isHidden: false, isOther: presetKey.startsWith('other'), sortOrder: 10, presetKey };
}

// In the starters' order: «Продукты», «Кафе», «Транспорт», …, «Другое» last
const CATEGORIES: Category[] = [
  category('c-gro', 'expense', 'Продукты', 'peach', 'groceries'),
  category('c-cafe', 'expense', 'Кафе', 'rose', 'cafe'),
  category('c-tr', 'expense', 'Транспорт', 'sky', 'transport'),
  category('c-other', 'expense', 'Другое', 'mist', 'other'),
  category('c-sal', 'income', 'Зарплата', 'mint', 'salary'),
  category('c-fr', 'income', 'Фриланс', 'lilac', 'freelance'),
].map((item, index) => ({ ...item, sortOrder: (index + 1) * 10 }));

function account(id: string, name: string, overrides: Partial<Account> = {}): Account {
  return {
    id, name, kind: 'card', currency: 'UZS', openingBalanceMinor: 0, openingDate: '2026-10-01', isHidden: false,
    sortOrder: 10, balanceMinor: 0, ...overrides,
  };
}

const ACCOUNTS: Account[] = [
  account('cash', 'Наличные', { kind: 'cash', balanceMinor: 125_000_000 }),
  account('card', 'Карта', { balanceMinor: 318_000_000 }),
  account('usd', 'Доллары', { kind: 'cash', currency: 'USD', balanceMinor: 42_000 }),
  account('old', 'Старая карта', { isHidden: true }),
];

const CONTEXT: ReviewContext = { categories: CATEGORIES, accounts: ACCOUNTS, rateMinor: 1_265_000, today: TODAY };

function captured(overrides: Partial<CapturedTransaction>): CapturedTransaction {
  return {
    id: 'x', amount: 0, type: 'expense', semanticType: 'expense', category: 'Другое', date: TODAY, needsReview: false,
    countsAsRealExpense: true, ...overrides,
  };
}

/** The phrase of the board: three records, the coffee's category guessed. */
const BOARD: QuickCaptureResult = {
  status: 'saved',
  text: 'кофе 25к, такси до работы 18 тысяч наличными, вчера пришло 300 долларов за лендинг',
  transactions: [
    captured({
      id: 'a', amount: 25000, amountMinor: 2_500_000, currency: 'UZS', category: 'Кафе', categoryId: 'c-cafe', accountId: 'card',
      description: 'кофе', assumptions: [{ kind: 'category', name: 'Кафе' }, { kind: 'account', name: 'Карта', reason: 'default' }],
    }),
    captured({
      id: 'b', amount: 18000, amountMinor: 1_800_000, currency: 'UZS', category: 'Транспорт', categoryId: 'c-tr', accountId: 'cash',
      description: 'такси до работы', assumptions: [{ kind: 'account', name: 'Наличные', reason: 'hint' }],
    }),
    captured({
      id: 'c', type: 'income', semanticType: 'income', amount: 300, amountMinor: 30_000, currency: 'USD', category: 'Фриланс',
      categoryId: 'c-fr', accountId: 'usd', description: 'за лендинг', date: YESTERDAY, countsAsRealExpense: false,
    }),
  ],
  debts: [],
  ack: { title: 'Записал', summary: '', actions: [] },
  review: { reasons: [] },
};

const board = (): ReviewSession => reviewSessionFrom(BOARD, CATEGORIES);
const text = (value: string) => value.replace(/\s+/g, ' ');

describe('the records of one phrase', () => {
  it('are checked on one screen, under the phrase itself', () => {
    const model = reviewModel(board(), CONTEXT);

    expect(model.text).toBe(`«${BOARD.text}»`);
    expect(model.items).toHaveLength(3);
    expect(model.summary).toBe('3 операции · 1 проверить');
    expect(model.save).toEqual({ label: 'Сохранить 3 операции', ready: true });
  });

  it('each show the signed amount with its unit, the note, the category, the account and the date', () => {
    const [coffee, taxi, landing] = reviewModel(board(), CONTEXT).items;

    expect(coffee).toMatchObject({ amount: `${MINUS}25${NBSP}000`, unit: 'сум', tone: 'expense', note: 'кофе' });
    expect(coffee.account.name).toBe('Карта');
    expect(coffee.date.label).toBe('Сегодня');
    expect(taxi).toMatchObject({ amount: `${MINUS}18${NBSP}000`, note: 'такси до работы' });
    expect(taxi.category).toMatchObject({ name: 'Транспорт', color: 'sky', guessed: false });
    expect(taxi.account.name).toBe('Наличные');
    expect(landing).toMatchObject({ amount: '+300,00', unit: 'USD', tone: 'income', note: 'за лендинг' });
    expect(landing.account.name).toBe('Доллары');
    expect(landing.date.label).toBe('Вчера, 13 окт');
  });

  it('name what each control changes', () => {
    const [coffee, taxi] = reviewModel(board(), CONTEXT).items;

    expect(coffee.category.aria).toBe('Категория: Кафе, не уверен — проверьте. Изменить');
    expect(taxi.category.aria).toBe('Категория: Транспорт. Изменить');
    expect(taxi.account.aria).toBe('Счёт: Наличные. Изменить');
    expect(taxi.date.aria).toBe('Дата: Сегодня. Изменить');
    expect(coffee.removeAria).toBe(`Убрать: Кафе, ${MINUS}25${NBSP}000 сум`);
  });

  it('take the category by id, and by name from a server that does not send the id', () => {
    const old = { ...BOARD, transactions: [captured({ id: 'a', amount: 25000, category: 'Кафе' })] };

    expect(reviewSessionFrom(old, CATEGORIES).items[0]).toMatchObject({ categoryId: 'c-cafe', amountMinor: 2_500_000, currency: 'UZS' });
  });
});

describe('the AI’s guess of a category', () => {
  it('is «Кафе ?» on a dashed chip until it is checked', () => {
    const [coffee] = reviewModel(board(), CONTEXT).items;

    expect(coffee.category).toMatchObject({ name: 'Кафе', color: 'rose', guessed: true });
  });

  it('is offered in the picker with the guess marked, among the categories of the record’s type', () => {
    const choices = categoryChoices(board(), 'a', CONTEXT);

    expect(choices.title).toBe('Категория расхода');
    expect(choices.categories.map((item) => item.name)).toEqual(['Продукты', 'Кафе', 'Транспорт', 'Другое']);
    expect(choices).toMatchObject({ selectedId: 'c-cafe', guessedId: 'c-cafe' });
    expect(categoryChoices(board(), 'c', CONTEXT)).toMatchObject({ title: 'Категория дохода', guessedId: null });
  });

  it('is confirmed by pressing the same category', () => {
    const { session, patch } = chooseCategory(board(), 'a', 'c-cafe');

    expect(reviewModel(session, CONTEXT).items[0].category.guessed).toBe(false);
    expect(reviewModel(session, CONTEXT).summary).toBe('3 операции');
    expect(patch).toEqual({ categoryId: 'c-cafe' });
  });

  it('is changed by pressing another one', () => {
    const { session, patch } = chooseCategory(board(), 'a', 'c-gro');

    expect(reviewModel(session, CONTEXT).items[0].category).toMatchObject({ name: 'Продукты', color: 'peach', guessed: false });
    expect(patch).toEqual({ categoryId: 'c-gro' });
  });
});

describe('«"45" понял как 45 000 сум»', () => {
  const short = (): ReviewSession =>
    reviewSessionFrom(
      {
        ...BOARD,
        text: 'кофе 45',
        transactions: [
          captured({
            id: 'a', amount: 45000, amountMinor: 4_500_000, currency: 'UZS', categoryId: 'c-cafe', accountId: 'card', description: 'кофе',
            assumptions: [{ kind: 'thousands', written: '45', amount: 45000 }],
          }),
        ],
      },
      CATEGORIES
    );

  it('says how a bare number was read', () => {
    expect(reviewModel(short(), CONTEXT).items[0].thousands).toBe(`«45» понял как 45${NBSP}000${NBSP}сум`);
    expect(reviewModel(board(), CONTEXT).items[0].thousands).toBeNull();
  });
});

describe('the account and the date', () => {
  it('are offered from the visible accounts with their balances', () => {
    expect(accountChoices(CONTEXT)).toEqual([
      { id: 'cash', name: 'Наличные', balance: `1${NBSP}250${NBSP}000${NBSP}сум` },
      { id: 'card', name: 'Карта', balance: `3${NBSP}180${NBSP}000${NBSP}сум` },
      { id: 'usd', name: 'Доллары', balance: `420,00${NBSP}USD` },
    ]);
  });

  it('another account of the same currency moves the record there', () => {
    const { session, patch } = chooseAccount(board(), 'a', ACCOUNTS[0], CONTEXT.rateMinor);

    expect(reviewModel(session, CONTEXT).items[0].account.name).toBe('Наличные');
    expect(reviewModel(session, CONTEXT).items[0].conversion).toBeNull();
    expect(patch).toEqual({ accountId: 'cash', currency: 'UZS' });
  });

  it('an account of another currency keeps the number and offers to convert it (design-system)', () => {
    const moved = chooseAccount(board(), 'a', ACCOUNTS[2], CONTEXT.rateMinor);
    const item = reviewModel(moved.session, CONTEXT).items[0];

    expect(moved.patch).toEqual({ accountId: 'usd', currency: 'USD' });
    expect(item).toMatchObject({ amount: `${MINUS}25${NBSP}000,00`, unit: 'USD' });
    // 25 000 сум at 12 650 сум for $1
    expect(item.conversion).toEqual({ note: 'Валюта сменилась, число осталось прежним', label: `Пересчитать: 1,98${NBSP}USD` });

    const converted = applyConversion(moved.session, 'a');
    expect(converted?.patch).toEqual({ amountMinor: 198 });
    expect(reviewModel(converted!.session, CONTEXT).items[0]).toMatchObject({ amount: `${MINUS}1,98`, conversion: null });
  });

  it('back to the first currency, nothing is offered: the number is the one written', () => {
    const there = chooseAccount(board(), 'a', ACCOUNTS[2], CONTEXT.rateMinor).session;
    const back = chooseAccount(there, 'a', ACCOUNTS[1], CONTEXT.rateMinor).session;

    expect(reviewModel(back, CONTEXT).items[0]).toMatchObject({ amount: `${MINUS}25${NBSP}000`, unit: 'сум', conversion: null });
  });

  it('a date moves the record to that day', () => {
    const { session, patch } = chooseDate(board(), 'b', addDays(TODAY, -3));

    expect(reviewModel(session, CONTEXT).items[1].date.label).toBe('11 окт');
    expect(patch).toEqual({ date: addDays(TODAY, -3) });
  });
});

describe('a record taken out of the phrase', () => {
  it('leaves the screen and the count, and says «Убрано» with what it was', () => {
    const session = removeItem(board(), 'a');
    const model = reviewModel(session, CONTEXT);

    expect(model.items.map((item) => item.id)).toEqual(['b', 'c']);
    expect(model.summary).toBe('2 операции');
    expect(model.save.label).toBe('Сохранить 2 операции');
    expect(removedToast(board().items[0], CONTEXT)).toEqual({ title: 'Убрано', detail: `Кафе · ${MINUS}25${NBSP}000${NBSP}сум` });
  });

  it('comes back with «Отменить»', () => {
    expect(reviewModel(restoreItem(removeItem(board(), 'a'), 'a'), CONTEXT).items).toHaveLength(3);
  });

  it('when none is left there is nothing to save', () => {
    const empty = ['a', 'b', 'c'].reduce(removeItem, board());
    const model = reviewModel(empty, CONTEXT);

    expect(model.summary).toBe('Ничего не осталось');
    expect(model.save).toEqual({ label: 'Нечего сохранять', ready: false });
  });
});

describe('«Записано» after the check', () => {
  it('names one record as Toast.md does', () => {
    const one = ['b', 'c'].reduce(removeItem, board());

    expect(capturedToast(one, CONTEXT)).toEqual({ title: 'Записано', detail: `кофе · ${MINUS}25${NBSP}000${NBSP}сум · Карта` });
  });

  it('counts several and names their categories', () => {
    expect(text(capturedToast(board(), CONTEXT).detail)).toBe('3 операции · Кафе, Транспорт, Фриланс');
  });

  it('undoes the records still on the screen: the removed one is already gone', () => {
    expect(liveItems(removeItem(board(), 'b')).map((item) => item.id)).toEqual(['a', 'c']);
  });
});
