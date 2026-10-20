import { describe, expect, it } from 'vitest';
import type { Account } from '@/entities/account';
import type { Category } from '@/entities/category';
import { emptyKeypad, keypadFromMinor, MINUS, NBSP, pressKey } from '@/shared/lib/money';
import type { Transaction } from '@/shared/types';
import {
  amountEntryModel,
  applyRecalculation,
  cancelTypeChange,
  categoryChangedToast,
  changeAmount,
  changeNote,
  chooseAccount,
  chooseCategory,
  chooseDate,
  chooseType,
  deletedToast,
  initialSheet,
  quickPickerContext,
  recordSheetModel,
  revertSheetChange,
  sheetRecordFrom,
  type SheetContext,
  type SheetState,
} from './recordSheet';

/**
 * FT-115, boards «Карточка операции», «Компонент · карточка операции», «Карточка · правка суммы»: what the
 * record sheet shows of a saved record and the patch every change of it sends at once.
 */

const category = (id: string, type: Category['type'], name: string, color: Category['color'], sortOrder: number, isOther = false): Category => ({
  id, type, name, color, isHidden: false, isOther, sortOrder, presetKey: null,
});

const CATEGORIES: Category[] = [
  category('c-pr', 'expense', 'Продукты', 'peach', 10),
  category('c-cafe', 'expense', 'Кафе', 'rose', 20),
  category('c-tr', 'expense', 'Транспорт', 'sky', 30),
  category('c-other', 'expense', 'Другое', 'mist', 90, true),
  category('c-zp', 'income', 'Зарплата', 'mint', 10),
  category('c-fr', 'income', 'Фриланс', 'lilac', 20),
];

const account = (id: string, name: string, currency: Account['currency'], sortOrder: number): Account => ({
  id, name, kind: id === 'card' ? 'card' : 'cash', currency, openingBalanceMinor: 0, openingDate: '2026-10-01', isHidden: false, sortOrder, balanceMinor: 0,
});

const ACCOUNTS: Account[] = [account('cash', 'Наличные', 'UZS', 10), account('card', 'Карта', 'UZS', 20), account('usd', 'Доллары', 'USD', 30)];
const USD = ACCOUNTS[2];
const CARD = ACCOUNTS[1];
const RATE = 1_265_000; // 12 650 сум for a dollar, as on the boards

const CONTEXT: SheetContext = { categories: CATEGORIES, accounts: ACCOUNTS, rateMinor: RATE, today: '2026-10-14' };

/** The board's record t4: «Кафе, −145 000 сум, Карта, вчера, Обед с командой». */
const T4: Transaction = {
  id: 't4',
  type: 'expense',
  amount: 145000,
  amountMinor: 14_500_000,
  currency: 'UZS',
  category: 'Кафе',
  categoryId: 'c-cafe',
  accountId: 'card',
  date: '2026-10-13',
  description: 'Обед с командой',
  userId: 'u1',
};

const sheet = (overrides: Partial<Transaction> = {}): SheetState => initialSheet(sheetRecordFrom({ ...T4, ...overrides }, CATEGORIES));
const field = (state: SheetState, label: string) => recordSheetModel(state, CONTEXT).fields.find((item) => item.label === label);

describe('what the sheet shows (board «Карточка операции»)', () => {
  it('the amount with its sign and unit, and the four fields', () => {
    const model = recordSheetModel(sheet(), CONTEXT);

    expect(model.type).toBe('expense');
    expect(model.amount).toMatchObject({ text: `${MINUS}145${NBSP}000`, unit: 'сум', tone: 'expense' });
    expect(model.amount.aria).toBe(`Сумма: ${MINUS}145${NBSP}000 сум. Изменить`);
    expect(model.fields.map(({ label, value, empty }) => ({ label, value, empty }))).toEqual([
      { label: 'Категория', value: 'Кафе', empty: false },
      { label: 'Счёт', value: 'Карта', empty: false },
      { label: 'Дата', value: 'Вчера, 13 октября', empty: false },
      { label: 'Заметка', value: 'Обед с командой', empty: false },
    ]);
    expect(field(sheet(), 'Категория')?.color).toBe('rose');
    expect(field(sheet(), 'Категория')?.aria).toBe('Категория: Кафе. Изменить');
    expect(model.dialogLabel).toBe(`Операция: Кафе, ${MINUS}145${NBSP}000 сум`);
    expect(model.recalculation).toBeNull();
  });

  it('no note — «Добавить», muted', () => {
    expect(field(sheet({ description: '' }), 'Заметка')).toMatchObject({ value: 'Добавить', empty: true });
  });

  it('the date: «Сегодня, 14 октября», «Вчера, 13 октября», else the weekday', () => {
    expect(field(sheet({ date: '2026-10-14' }), 'Дата')?.value).toBe('Сегодня, 14 октября');
    expect(field(sheet({ date: '2026-10-12' }), 'Дата')?.value).toBe('Понедельник, 12 октября');
  });

  it('income is green with «+», dollars with cents and «USD»', () => {
    expect(recordSheetModel(sheet({ type: 'income', categoryId: 'c-zp', amountMinor: 1_250_000_000 }), CONTEXT).amount).toMatchObject({
      text: `+12${NBSP}500${NBSP}000`,
      tone: 'income',
    });
    expect(recordSheetModel(sheet({ accountId: 'usd', currency: 'USD', amountMinor: 5_500 }), CONTEXT).amount).toMatchObject({
      text: `${MINUS}55,00`,
      unit: 'USD',
    });
  });

  it('a long amount gets the smaller size instead of wrapping', () => {
    expect(recordSheetModel(sheet(), CONTEXT).amount.large).toBe(true);
    expect(recordSheetModel(sheet({ amountMinor: 1_250_000_000_00 }), CONTEXT).amount.large).toBe(false);
  });

  it('a guest has no accounts: no «Счёт» row', () => {
    const model = recordSheetModel(sheet({ accountId: undefined }), { ...CONTEXT, accounts: [] });

    expect(model.fields.map((item) => item.label)).toEqual(['Категория', 'Дата', 'Заметка']);
  });

  it('a record without a category id finds it by name (guest records from before FT-099)', () => {
    expect(field(sheet({ categoryId: undefined, category: 'кафе' }), 'Категория')?.value).toBe('Кафе');
  });
});

describe('every change is one patch of the saved record', () => {
  it('another category', () => {
    expect(chooseCategory(sheet(), 'c-pr').patch).toEqual({ categoryId: 'c-pr' });
    expect(field(chooseCategory(sheet(), 'c-pr').state, 'Категория')?.value).toBe('Продукты');
  });

  it('the same category again sends nothing', () => {
    expect(chooseCategory(sheet(), 'c-cafe').patch).toBeNull();
  });

  it('the date, the note (trimmed, may be cleared), the amount', () => {
    expect(chooseDate(sheet(), '2026-10-14').patch).toEqual({ date: '2026-10-14' });
    expect(chooseDate(sheet(), '2026-10-13').patch).toBeNull();
    expect(changeNote(sheet(), '  Ужин ').patch).toEqual({ description: 'Ужин' });
    expect(changeNote(sheet(), '').patch).toEqual({ description: '' });
    expect(changeNote(sheet(), 'Обед с командой ').patch).toBeNull();
    expect(changeAmount(sheet(), 20_000_000).patch).toEqual({ amountMinor: 20_000_000 });
    expect(changeAmount(sheet(), 14_500_000).patch).toBeNull();
  });
});

describe('«Расход / Доход» (TxnSheet.md)', () => {
  it('another type clears the category and saves nothing until a category of that type is chosen', () => {
    const switched = chooseType(sheet(), 'income');

    expect(recordSheetModel(switched, CONTEXT).type).toBe('income');
    expect(field(switched, 'Категория')).toMatchObject({ value: 'Выберите', empty: true });

    const chosen = chooseCategory(switched, 'c-zp');
    expect(chosen.patch).toEqual({ type: 'income', categoryId: 'c-zp', semanticType: 'income' });
    expect(chosen.state.typeChange).toBeNull();
    expect(recordSheetModel(chosen.state, CONTEXT).amount.tone).toBe('income');
  });

  it('closing the choice brings the type and the category back', () => {
    const back = cancelTypeChange(chooseType(sheet(), 'income'));

    expect(back.record).toMatchObject({ type: 'expense', categoryId: 'c-cafe' });
    expect(back.typeChange).toBeNull();
  });

  it('the same type again changes nothing', () => {
    expect(chooseType(sheet(), 'expense')).toEqual(sheet());
  });
});

describe('another account (TxnSheet.md: the number stays, «Пересчитать» is offered)', () => {
  it('of another currency: moved with its currency, the number kept, the converted amount offered', () => {
    const moved = chooseAccount(sheet(), USD, RATE);

    expect(moved.patch).toEqual({ accountId: 'usd', currency: 'USD' });
    expect(recordSheetModel(moved.state, CONTEXT).amount).toMatchObject({ text: `${MINUS}145${NBSP}000,00`, unit: 'USD' });
    expect(recordSheetModel(moved.state, CONTEXT).recalculation).toEqual({
      note: 'Валюта сменилась, число осталось прежним',
      label: `Пересчитать: 11,46${NBSP}USD`,
    });
  });

  it('«Пересчитать» writes the converted amount', () => {
    const applied = applyRecalculation(chooseAccount(sheet(), USD, RATE).state);

    expect(applied?.patch).toEqual({ amountMinor: 1_146 });
    expect(recordSheetModel(applied!.state, CONTEXT).amount.text).toBe(`${MINUS}11,46`);
    expect(recordSheetModel(applied!.state, CONTEXT).recalculation).toBeNull();
  });

  it('back to the first currency nothing is offered: the number is the one written', () => {
    const back = chooseAccount(chooseAccount(sheet(), USD, RATE).state, CARD, RATE);

    expect(back.patch).toEqual({ accountId: 'card', currency: 'UZS' });
    expect(recordSheetModel(back.state, CONTEXT).recalculation).toBeNull();
  });

  it('a new amount takes the offer away', () => {
    const typed = changeAmount(chooseAccount(sheet(), USD, RATE).state, 1_200);

    expect(recordSheetModel(typed.state, CONTEXT).recalculation).toBeNull();
  });

  it('without a rate the record moves and nothing is offered', () => {
    expect(recordSheetModel(chooseAccount(sheet(), USD, null).state, CONTEXT).recalculation).toBeNull();
  });

  it('of the same currency it just moves; the same account sends nothing', () => {
    expect(chooseAccount(sheet(), ACCOUNTS[0], RATE).patch).toEqual({ accountId: 'cash', currency: 'UZS' });
    expect(chooseAccount(sheet(), CARD, RATE).patch).toBeNull();
  });
});

describe('a change the server refused goes back', () => {
  it('only its fields, and only those nothing changed since', () => {
    const before = sheet();
    const dated = chooseDate(before, '2026-10-14').state;
    const noted = changeNote(dated, 'Ужин').state;

    const reverted = revertSheetChange(noted, before, dated);

    expect(reverted.record).toMatchObject({ date: '2026-10-13', note: 'Ужин' });
  });
});

describe('the amount on the keypad (board «Карточка · правка суммы»)', () => {
  it('the current amount is pale until the first key, with its conversion', () => {
    const model = amountEntryModel(sheet().record, keypadFromMinor(14_500_000, 'UZS'), RATE);

    expect(model).toMatchObject({ text: `${MINUS}145${NBSP}000`, unit: 'сум', pale: true, conversion: `≈ 11,46${NBSP}USD` });
    expect(model.save).toEqual({ label: 'Готово', ready: true });
  });

  it('the first key replaces it', () => {
    const keypad = pressKey(keypadFromMinor(14_500_000, 'UZS'), '5', 'UZS');

    expect(amountEntryModel(sheet().record, keypad, RATE)).toMatchObject({ text: `${MINUS}5`, pale: false });
  });

  it('nothing typed: «0», the rate, and the button says what is missing', () => {
    const model = amountEntryModel(sheet().record, emptyKeypad(), RATE);

    expect(model).toMatchObject({ text: '0', tone: 'placeholder', conversion: `1${NBSP}USD = 12${NBSP}650${NBSP}сум` });
    expect(model.save).toEqual({ label: 'Введите сумму', ready: false });
  });

  it('without a rate there is no conversion line', () => {
    expect(amountEntryModel(sheet().record, keypadFromMinor(14_500_000, 'UZS'), null).conversion).toBeNull();
  });
});

describe('what the toasts and the quick choice say (Toast.md, Picker.md)', () => {
  it('«Удалено / Кафе · −145 000 сум»', () => {
    expect(deletedToast(sheet().record, CONTEXT)).toEqual({ title: 'Удалено', detail: `Кафе · ${MINUS}145${NBSP}000${NBSP}сум` });
  });

  it('«Категория изменена / Кафе → Продукты»', () => {
    expect(categoryChangedToast('c-cafe', 'c-pr', CONTEXT)).toEqual({ title: 'Категория изменена', detail: 'Кафе → Продукты' });
  });

  it('the line over the quick choice: the note and the amount', () => {
    expect(quickPickerContext(sheet().record)).toBe(`Обед с командой · ${MINUS}145${NBSP}000${NBSP}сум`);
    expect(quickPickerContext(sheet({ description: '' }).record)).toBe(`${MINUS}145${NBSP}000${NBSP}сум`);
  });
});
