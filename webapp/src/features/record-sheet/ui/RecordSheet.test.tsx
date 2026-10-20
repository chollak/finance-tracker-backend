// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { deleteTransaction, patchTransaction, restoreTransaction, transactionKeys } from '@/entities/transaction';
import type { Account } from '@/entities/account';
import type { Category } from '@/entities/category';
import { useUserStore } from '@/entities/user';
import { apiClient } from '@/shared/api';
import { MINUS, NBSP } from '@/shared/lib/money';
import { useUndoToastStore, visibleEntry } from '@/shared/lib/undo';
import type { Transaction } from '@/shared/types';
import { openRecordCategory, openRecordSheet, useRecordSheetStore } from '../model/recordSheetStore';
import { RecordSheet } from './RecordSheet';

/**
 * FT-115, boards «Карточка операции», «Карточка · правка суммы», «Карточка · выбор категории», «Карточка ·
 * выбор даты»: the sheet of a saved record. Every change is saved at once and says «Сохранено» for 2 seconds;
 * «Готово» closes it and the changed row is ringed; «Удалить операцию» deletes without asking, with «Отменить»
 * in the toast; an account of another currency keeps the number and offers «Пересчитать». Rendered in jsdom:
 * the sheets are Radix dialogs in portals.
 */

vi.mock('@/entities/transaction', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/transaction')>();
  return { ...actual, deleteTransaction: vi.fn(), patchTransaction: vi.fn(), restoreTransaction: vi.fn() };
});

const category = (id: string, type: Category['type'], name: string, color: Category['color'], sortOrder: number): Category => ({
  id, type, name, color, isHidden: false, isOther: false, sortOrder, presetKey: null,
});

const CATEGORIES: Category[] = [
  category('c-pr', 'expense', 'Продукты', 'peach', 10),
  category('c-cafe', 'expense', 'Кафе', 'rose', 20),
  category('c-zp', 'income', 'Зарплата', 'mint', 10),
];

const account = (id: string, name: string, currency: Account['currency'], sortOrder: number, balanceMinor: number): Account => ({
  id, name, kind: id === 'card' ? 'card' : 'cash', currency, openingBalanceMinor: 0, openingDate: '2026-10-01', isHidden: false, sortOrder, balanceMinor,
});

const ACCOUNTS: Account[] = [
  account('cash', 'Наличные', 'UZS', 10, 125_000_000),
  account('card', 'Карта', 'UZS', 20, 318_000_000),
  account('usd', 'Доллары', 'USD', 30, 42_000),
];

vi.mock('@/entities/category', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/category')>();
  return { ...actual, useCategories: () => ({ data: CATEGORIES }) };
});
vi.mock('@/entities/account', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/account')>();
  return { ...actual, useAccounts: () => ({ data: { accounts: ACCOUNTS } }) };
});
vi.mock('@/entities/rate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/rate')>();
  return { ...actual, useUsdRate: () => ({ data: { effective: { rateMinor: 1_265_000 } } }) };
});

const USER_ID = '900000001';

/** The board's record t4. */
const T4: Transaction = {
  id: 't4', type: 'expense', amount: 145000, amountMinor: 14_500_000, currency: 'UZS', category: 'Кафе', categoryId: 'c-cafe',
  accountId: 'card', date: '2026-10-13', description: 'Обед с командой', userId: USER_ID,
};

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0, 0));
  vi.mocked(patchTransaction).mockReset().mockResolvedValue(undefined);
  vi.mocked(deleteTransaction).mockReset().mockResolvedValue(undefined);
  vi.mocked(restoreTransaction).mockReset().mockResolvedValue(undefined);
  useUserStore.setState({ userId: USER_ID, userType: 'telegram', telegramId: USER_ID, userName: 'Шукур' });
  useRecordSheetStore.setState({ target: null, flashId: null });
  useUndoToastStore.setState({ stack: [], openSheets: 0 });

  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(transactionKeys.record('t4'), T4);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <RecordSheet />
        </MemoryRouter>
      </QueryClientProvider>
    )
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const page = () => document.body.textContent ?? '';

function buttons(): HTMLButtonElement[] {
  return [...document.body.querySelectorAll('button')];
}

/** A button by its accessible name: the aria-label, else its text. The last one is the topmost sheet's. */
function button(name: string): HTMLButtonElement {
  const found = buttons().filter((item) => (item.getAttribute('aria-label') ?? item.textContent?.trim()) === name);
  if (found.length === 0) throw new Error(`No button «${name}» in: ${buttons().map((item) => item.getAttribute('aria-label') ?? item.textContent).join(' | ')}`);
  return found[found.length - 1];
}

function radio(name: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((item) => item.textContent?.includes(name));
  if (!found) throw new Error(`No choice «${name}»`);
  return found;
}

async function press(target: HTMLElement): Promise<void> {
  await act(async () => {
    target.click();
  });
}

/** Lets the pending saves answer. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

const latestPatch = () => vi.mocked(patchTransaction).mock.calls.at(-1)?.[1];

async function openT4(): Promise<void> {
  await act(async () => openRecordSheet('t4', T4));
}

/** Lets the read of the record (`GET /transactions/:id`) answer: the query client notifies on a timer. */
async function answerRead(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
}

const toastNow = () => visibleEntry(useUndoToastStore.getState().stack, Date.now());

describe('opening (row → the whole sheet)', () => {
  it('shows the record: the type, the amount and the four fields', async () => {
    await openT4();

    expect(button('Расход').getAttribute('aria-pressed')).toBe('true');
    expect(button(`Сумма: ${MINUS}145${NBSP}000 сум. Изменить`)).toBeTruthy();
    expect(button('Категория: Кафе. Изменить')).toBeTruthy();
    expect(button('Счёт: Карта. Изменить')).toBeTruthy();
    expect(button('Дата: Вчера, 13 октября. Изменить')).toBeTruthy();
    expect(button('Заметка: Обед с командой. Изменить')).toBeTruthy();
    expect(page()).toContain('Изменения сохраняются сразу');
  });
});

describe('every change is saved at once', () => {
  it('a date from the calendar: one patch, «Сохранено» for 2 seconds', async () => {
    await openT4();
    await press(button('Дата: Вчера, 13 октября. Изменить'));
    await press(button('Сегодня'));
    await settle();

    expect(patchTransaction).toHaveBeenCalledTimes(1);
    expect(latestPatch()).toEqual({ id: 't4', userId: USER_ID, patch: { date: '2026-10-14' } });
    expect(button('Дата: Сегодня, 14 октября. Изменить')).toBeTruthy();
    expect(page()).toContain('Сохранено');
    expect(page()).not.toContain('Изменения сохраняются сразу');

    await act(async () => vi.advanceTimersByTime(2000));
    expect(page()).not.toContain('Сохранено');
    expect(page()).toContain('Изменения сохраняются сразу');
  });

  it('a change the server refused goes back, and the sheet says so', async () => {
    vi.mocked(patchTransaction).mockRejectedValueOnce({ statusCode: 0, message: 'offline' });
    await openT4();
    await press(button('Дата: Вчера, 13 октября. Изменить'));
    await press(button('Сегодня'));
    await settle();

    expect(button('Дата: Вчера, 13 октября. Изменить')).toBeTruthy();
    expect(page()).toContain('Не получилось сохранить');
    expect(page()).not.toContain('Сохранено');
  });

  it('the amount on the keypad: the first key replaces it, «Готово» saves it', async () => {
    await openT4();
    await press(button(`Сумма: ${MINUS}145${NBSP}000 сум. Изменить`));
    expect(page()).toContain('Сумма');
    expect(document.body.querySelector('[aria-label="Цифровая клавиатура"]')).not.toBeNull();

    for (const key of ['2', 'Три нуля', '0', '0']) {
      await press(key === 'Три нуля' ? button('Три нуля') : buttons().find((item) => item.textContent === key)!);
    }
    await press(button('Готово'));
    await settle();

    expect(latestPatch()).toEqual({ id: 't4', userId: USER_ID, patch: { amountMinor: 20_000_000 } });
    expect(button(`Сумма: ${MINUS}200${NBSP}000 сум. Изменить`)).toBeTruthy();
  });

  it('the amount left as it was saves nothing', async () => {
    await openT4();
    await press(button(`Сумма: ${MINUS}145${NBSP}000 сум. Изменить`));
    await press(button('Готово'));

    expect(patchTransaction).not.toHaveBeenCalled();
    expect(page()).toContain('Изменения сохраняются сразу');
  });

  it('the note: typed and saved with Enter', async () => {
    await openT4();
    await press(button('Заметка: Обед с командой. Изменить'));
    const input = document.body.querySelector<HTMLInputElement>('input[type="text"]')!;

    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setValue.call(input, 'Ужин');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    await settle();

    expect(latestPatch()).toEqual({ id: 't4', userId: USER_ID, patch: { description: 'Ужин' } });
    expect(button('Заметка: Ужин. Изменить')).toBeTruthy();
  });
});

describe('«Расход / Доход»', () => {
  it('another type opens its categories; closing the choice brings the type and the category back', async () => {
    await openT4();
    await press(button('Доход'));

    expect(page()).toContain('Категория дохода');
    expect(patchTransaction).not.toHaveBeenCalled();

    await press(button('Закрыть'));

    expect(button('Расход').getAttribute('aria-pressed')).toBe('true');
    expect(button('Категория: Кафе. Изменить')).toBeTruthy();
    expect(patchTransaction).not.toHaveBeenCalled();
  });

  it('a category of the new type saves both', async () => {
    await openT4();
    await press(button('Доход'));
    await press(radio('Зарплата'));
    await settle();

    expect(latestPatch()).toEqual({ id: 't4', userId: USER_ID, patch: { type: 'income', categoryId: 'c-zp', semanticType: 'income' } });
    expect(button('Доход').getAttribute('aria-pressed')).toBe('true');
    expect(button('Категория: Зарплата. Изменить')).toBeTruthy();
  });
});

describe('an account of another currency', () => {
  it('keeps the number and offers «Пересчитать: 11,46 USD»', async () => {
    await openT4();
    await press(button('Счёт: Карта. Изменить'));
    await press(radio('Доллары'));
    await settle();

    expect(latestPatch()).toEqual({ id: 't4', userId: USER_ID, patch: { accountId: 'usd', currency: 'USD' } });
    expect(button(`Сумма: ${MINUS}145${NBSP}000,00 USD. Изменить`)).toBeTruthy();
    expect(page()).toContain('Валюта сменилась, число осталось прежним');

    await press(button(`Пересчитать: 11,46${NBSP}USD`));
    await settle();

    expect(latestPatch()).toEqual({ id: 't4', userId: USER_ID, patch: { amountMinor: 1_146 } });
    expect(button(`Сумма: ${MINUS}11,46 USD. Изменить`)).toBeTruthy();
    expect(page()).not.toContain('Валюта сменилась');
  });
});

describe('«Готово» and the ring on the row', () => {
  it('after a change «Готово» closes the sheet and rings the row for 2 seconds', async () => {
    await openT4();
    await press(button('Дата: Вчера, 13 октября. Изменить'));
    await press(button('Сегодня'));
    await settle();
    await press(button('Готово'));

    expect(useRecordSheetStore.getState().target).toBeNull();
    expect(page()).not.toContain('Изменения сохраняются сразу');
    expect(useRecordSheetStore.getState().flashId).toBe('t4');

    await act(async () => vi.advanceTimersByTime(2000));
    expect(useRecordSheetStore.getState().flashId).toBeNull();
  });

  it('nothing changed: «Готово» just closes', async () => {
    await openT4();
    await press(button('Готово'));

    expect(useRecordSheetStore.getState().target).toBeNull();
    expect(useRecordSheetStore.getState().flashId).toBeNull();
  });

  it('the only change was refused: «Готово» closes without ringing the row', async () => {
    vi.mocked(patchTransaction).mockRejectedValueOnce({ statusCode: 0, message: 'offline' });
    await openT4();
    await press(button('Дата: Вчера, 13 октября. Изменить'));
    await press(button('Сегодня'));
    await settle();
    await press(button('Готово'));

    expect(useRecordSheetStore.getState().target).toBeNull();
    expect(useRecordSheetStore.getState().flashId).toBeNull();
  });

  it('«Готово» before the save answered: the row is ringed once it is saved, not if it is refused', async () => {
    let answer!: { resolve: () => void; reject: (error: unknown) => void };
    const pending = () =>
      new Promise<void>((resolve, reject) => {
        answer = { resolve, reject };
      });

    vi.mocked(patchTransaction).mockImplementationOnce(pending);
    await openT4();
    await press(button('Дата: Вчера, 13 октября. Изменить'));
    await press(button('Сегодня'));
    await press(button('Готово'));
    expect(useRecordSheetStore.getState().flashId).toBeNull();
    await act(async () => answer.resolve());
    expect(useRecordSheetStore.getState().flashId).toBe('t4');

    await act(async () => vi.advanceTimersByTime(2000));
    vi.mocked(patchTransaction).mockImplementationOnce(pending);
    await openT4();
    await press(button('Дата: Вчера, 13 октября. Изменить'));
    await press(button('Сегодня'));
    await press(button('Готово'));
    await act(async () => answer.reject({ statusCode: 0, message: 'offline' }));
    expect(useRecordSheetStore.getState().flashId).toBeNull();
    expect(toastNow()).toMatchObject({ kind: 'info', title: 'Не получилось сохранить' });
  });
});

describe('«Удалить операцию»', () => {
  it('deletes without asking, closes the sheet and shows «Удалено» with «Отменить», which brings it back', async () => {
    await openT4();
    await press(button('Удалить операцию'));
    await settle();

    expect(deleteTransaction).toHaveBeenCalledWith(client, { id: 't4', userId: USER_ID });
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull();
    expect(useRecordSheetStore.getState().target).toBeNull();

    const toast = visibleEntry(useUndoToastStore.getState().stack, Date.now());
    expect(toast).toMatchObject({ kind: 'deleted', title: 'Удалено', detail: `Кафе · ${MINUS}145${NBSP}000${NBSP}сум` });

    await act(async () => useUndoToastStore.getState().undoVisible());
    expect(restoreTransaction).toHaveBeenCalledWith(client, { id: 't4', userId: USER_ID });
  });

  it('a delete that failed keeps the sheet open and says so', async () => {
    vi.mocked(deleteTransaction).mockRejectedValueOnce({ statusCode: 0, message: 'offline' });
    await openT4();
    await press(button('Удалить операцию'));
    await settle();

    expect(useRecordSheetStore.getState().target).toMatchObject({ id: 't4' });
    expect(page()).toContain('Не получилось удалить');
  });
});

describe('the category circle of a row (board «Карточка · выбор категории»)', () => {
  it('opens the choice at once, with the note and the amount, and «Вся операция»', async () => {
    await act(async () => openRecordCategory('t4', T4));

    expect(page()).toContain('Категория расхода');
    expect(page()).toContain(`Обед с командой · ${MINUS}145${NBSP}000${NBSP}сум`);
    expect(page()).not.toContain('Изменения сохраняются сразу');

    await press(button('Вся операция'));
    expect(page()).toContain('Изменения сохраняются сразу');
  });

  it('a pick saves it, rings the row and says «Категория изменена» with «Отменить»', async () => {
    await act(async () => openRecordCategory('t4', T4));
    await press(radio('Продукты'));
    await settle();

    expect(latestPatch()).toEqual({ id: 't4', userId: USER_ID, patch: { categoryId: 'c-pr' } });
    expect(useRecordSheetStore.getState().target).toBeNull();
    expect(useRecordSheetStore.getState().flashId).toBe('t4');
    expect(visibleEntry(useUndoToastStore.getState().stack, Date.now())).toMatchObject({
      title: 'Категория изменена',
      detail: 'Кафе → Продукты',
    });

    await act(async () => useUndoToastStore.getState().undoVisible());
    expect(latestPatch()).toEqual({ id: 't4', userId: USER_ID, patch: { categoryId: 'c-cafe' } });
  });

  it('a pick the server refused: no ring on the row, «Не получилось сохранить»', async () => {
    vi.mocked(patchTransaction).mockRejectedValueOnce({ statusCode: 0, message: 'offline' });
    await act(async () => openRecordCategory('t4', T4));
    await press(radio('Продукты'));
    await settle();

    expect(useRecordSheetStore.getState().target).toBeNull();
    expect(useRecordSheetStore.getState().flashId).toBeNull();
    expect(toastNow()).toMatchObject({ kind: 'info', title: 'Не получилось сохранить' });
  });
});

/**
 * The sheet reads the record (`GET /transactions/:id`) even when the list passed it in; a 5xx, no connection
 * or a 429 must not take away what the list already has. Only a record that is gone (404) is shown as gone.
 */
describe('the read of the record fails', () => {
  let read: MockInstance<typeof apiClient.get>;

  beforeEach(() => {
    client.removeQueries({ queryKey: transactionKeys.record('t4') });
    read = vi.spyOn(apiClient, 'get');
  });

  afterEach(() => read.mockRestore());

  it('the category circle still opens the choice, from the record the list has, and the pick is saved', async () => {
    read.mockRejectedValue({ statusCode: 503, message: 'Service Unavailable' });
    await act(async () => openRecordCategory('t4', T4));
    await answerRead();

    expect(read).toHaveBeenCalledWith('/transactions/t4');
    expect(page()).toContain('Категория расхода');
    expect(page()).toContain(`Обед с командой · ${MINUS}145${NBSP}000${NBSP}сум`);

    await press(radio('Продукты'));
    await settle();
    expect(latestPatch()).toEqual({ id: 't4', userId: USER_ID, patch: { categoryId: 'c-pr' } });
  });

  it('a row still shows the record the list has, not «Не получилось загрузить»', async () => {
    read.mockRejectedValue({ statusCode: 0, message: 'offline' });
    await openT4();
    await answerRead();

    expect(read).toHaveBeenCalledWith('/transactions/t4');
    expect(button('Категория: Кафе. Изменить')).toBeTruthy();
    expect(page()).not.toContain('Не получилось загрузить');
  });

  it('a row without the list\'s record: the sheet says the read failed and reads again on «Попробовать снова»', async () => {
    read.mockRejectedValueOnce({ statusCode: 503, message: 'Service Unavailable' }).mockResolvedValueOnce({ data: T4 });
    await act(async () => openRecordSheet('t4'));
    await answerRead();
    expect(page()).toContain('Не получилось загрузить операцию');

    await press(button('Попробовать снова'));
    await answerRead();
    expect(button('Категория: Кафе. Изменить')).toBeTruthy();
  });

  it('a record that is gone (404): the row says so, the circle closes the choice with a toast', async () => {
    read.mockRejectedValue({ statusCode: 404, message: 'Transaction not found' });
    await openT4();
    await answerRead();
    expect(page()).toContain('Этой операции больше нет');

    await press(button('Закрыть'));
    await act(async () => openRecordCategory('t4', T4));
    await answerRead();

    expect(page()).not.toContain('Категория расхода');
    expect(useRecordSheetStore.getState().target).toBeNull();
    expect(toastNow()).toMatchObject({ kind: 'info', title: 'Этой операции больше нет' });
  });

  it('the circle without the list\'s record: a failed read closes the choice, and the next tap reads again', async () => {
    read.mockRejectedValueOnce({ statusCode: 503, message: 'Service Unavailable' }).mockResolvedValueOnce({ data: T4 });
    await act(async () => openRecordCategory('t4'));
    await answerRead();

    expect(useRecordSheetStore.getState().target).toBeNull();
    expect(toastNow()).toMatchObject({ kind: 'info', title: 'Не получилось загрузить операцию' });

    await act(async () => openRecordCategory('t4'));
    await answerRead();
    expect(read).toHaveBeenCalledTimes(2);
    expect(page()).toContain('Категория расхода');
  });
});
