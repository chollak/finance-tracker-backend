// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { Account } from '@/entities/account';
import type { Category } from '@/entities/category';
import { transactionKeys, type HistoryPage } from '@/entities/transaction';
import { useUserStore } from '@/entities/user';
import { useRecordSheetStore } from '@/features/record-sheet';
import { apiClient } from '@/shared/api';
import { ROUTES } from '@/shared/lib/constants/routes';
import { addDays, dayMonth, toLocalDate } from '@/shared/lib/dates';
import { MINUS, NBSP } from '@/shared/lib/money';
import type { Transaction } from '@/shared/types';
import { SEARCH_DELAY_MS } from '@/features/history-filters';
import { TransactionsPage } from './TransactionsPage';

/**
 * FT-116, boards «История», «История · «такси» + Наличные», «История · ничего не найдено»: search and filter chips
 * narrow History on the server (GET /api/transactions), page by page; days carry their totals; a row opens its
 * record sheet; nothing found says what was searched and resets it. The tabs «Текущие / Скрытые» and «Скрыть все»
 * are gone. Rendered in jsdom with the history API answered here.
 */

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  const pending = () => new Promise<never>(() => {});
  return { ...actual, apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), delete: vi.fn(pending) } };
});

const CATEGORIES: Category[] = [
  { id: 'c-food', type: 'expense', name: 'Продукты', color: 'peach', isHidden: false, isOther: false, sortOrder: 10, presetKey: 'groceries' },
  { id: 'c-cafe', type: 'expense', name: 'Кафе', color: 'rose', isHidden: false, isOther: false, sortOrder: 20, presetKey: 'cafe' },
  { id: 'c-tr', type: 'expense', name: 'Транспорт', color: 'sky', isHidden: false, isOther: false, sortOrder: 30, presetKey: 'transport' },
  { id: 'c-salary', type: 'income', name: 'Зарплата', color: 'mint', isHidden: false, isOther: false, sortOrder: 10, presetKey: 'salary' },
];

const account = (id: string, name: string, currency: 'UZS' | 'USD' = 'UZS', sortOrder = 10): Account => ({
  id, name, kind: id === 'card' ? 'card' : 'cash', currency, openingBalanceMinor: 0, openingDate: '2026-10-01', isHidden: false, sortOrder, balanceMinor: 0,
});
const ACCOUNTS: Account[] = [account('cash', 'Наличные', 'UZS', 10), account('card', 'Карта', 'UZS', 20), account('usd', 'Доллары', 'USD', 30)];

vi.mock('@/entities/category', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/category')>();
  return { ...actual, useCategories: () => ({ data: CATEGORIES }) };
});
vi.mock('@/entities/account', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/account')>();
  return { ...actual, useAccounts: () => ({ data: { accounts: ACCOUNTS, totalMinor: 0, rate: null, missingRate: false } }) };
});
vi.mock('@/entities/rate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/rate')>();
  return { ...actual, useUsdRate: () => ({ data: { effective: { rateMinor: 1_265_000, source: 'cbu', date: '2026-10-14' }, cbu: null, own: null } }) };
});

const USER_ID = '900000001';
const TODAY = toLocalDate(new Date());
const YESTERDAY = addDays(TODAY, -1);

const record = (overrides: Partial<Transaction>): Transaction => ({
  id: 'r', type: 'expense', amount: 0, currency: 'UZS', category: 'Другое', description: '', date: TODAY, userId: USER_ID, ...overrides,
});

// The board's first days
const T1 = record({ id: 't1', categoryId: 'c-food', category: 'Продукты', amountMinor: 18_640_000, description: 'Супермаркет', accountId: 'card' });
const T2 = record({ id: 't2', categoryId: 'c-tr', category: 'Транспорт', amountMinor: 2_400_000, description: 'Такси', accountId: 'cash' });
const T3 = record({ id: 't3', categoryId: 'c-salary', category: 'Зарплата', type: 'income', amountMinor: 1_250_000_000, date: YESTERDAY, description: 'За сентябрь', accountId: 'card' });
const T4 = record({ id: 't4', categoryId: 'c-cafe', category: 'Кафе', amountMinor: 14_500_000, date: YESTERDAY, description: 'Обед с командой', accountId: 'card' });
const T8 = record({ id: 't8', categoryId: 'c-tr', category: 'Транспорт', amountMinor: 8_500_000, date: addDays(TODAY, -2), description: 'Такси в аэропорт', accountId: 'cash' });

const page = (items: Transaction[], extra: Partial<HistoryPage> = {}): HistoryPage => ({ items, nextCursor: null, summary: null, ...extra });

/** What the history API answers, by the request's parameters. */
let answer: (params: URLSearchParams) => HistoryPage;
let requests: URLSearchParams[];

// IntersectionObserver is not in jsdom: the end of the list «comes into view» when a test says so
let observers: Array<(entries: Array<{ isIntersecting: boolean }>) => void>;
class FakeIntersectionObserver {
  constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
    observers.push(callback);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  observers = [];
  requests = [];
  answer = () => page([T1, T2, T3, T4, T8]);
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    const [path, search = ''] = url.split('?');
    if (path !== '/transactions') return new Promise<never>(() => {});
    const params = new URLSearchParams(search);
    requests.push(params);
    return { success: true, data: answer(params) } as never;
  });
  useUserStore.setState({ userId: USER_ID, userType: 'telegram', telegramId: USER_ID, userName: 'Шукур' });
  useRecordSheetStore.setState({ target: null, flashId: null });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderHistory() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: ROUTES.TRANSACTIONS, element: <TransactionsPage /> }], {
    initialEntries: [ROUTES.TRANSACTIONS],
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );
  });
  await settle();
}

/** Lets the debounced search and the answered reads reach the screen. */
async function settle(ms = 0) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

// Collapses ordinary spaces; keeps the non-breaking ones money is grouped with
const text = () => document.body.textContent?.replace(/[ \t\n\r]+/g, ' ') ?? '';
const buttons = () => [...document.body.querySelectorAll<HTMLButtonElement>('button')];
function button(name: string): HTMLButtonElement {
  const found = buttons().find((item) => item.getAttribute('aria-label') === name || item.textContent?.trim() === name);
  if (!found) throw new Error(`No button «${name}»`);
  return found;
}
async function press(name: string) {
  await act(async () => button(name).click());
  await settle();
}
const searchInput = () => document.body.querySelector<HTMLInputElement>('input[type="search"]')!;
async function type(value: string) {
  const input = searchInput();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle(SEARCH_DELAY_MS + 50);
  await settle();
}
const lastRequest = () => requests[requests.length - 1];

describe('History', () => {
  it('shows the search, the category chip and the accounts, and the days with their totals — no tabs, no «Скрыть все»', async () => {
    await renderHistory();

    expect(document.body.querySelector('h1')?.textContent).toBe('История');
    expect(searchInput().placeholder).toBe('Такси, кафе, 25 000…');
    expect(button('Фильтр по категории')).toBeTruthy();
    expect(['Наличные', 'Карта', 'Доллары'].map((name) => button(name).getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false']);
    expect(text()).toContain(`Сегодня, ${dayMonth(TODAY)}`);
    expect(text()).toContain(`Итог дня: ${MINUS}210${NBSP}400${NBSP}сум`);
    expect(text()).toContain('Супермаркет · Карта');
    expect(text()).not.toMatch(/Текущие|Скрытые|Скрыть все/);
    expect(buttons().some((item) => item.textContent?.trim() === 'Сбросить')).toBe(false);
    expect(lastRequest().toString()).toBe('');
  });

  it('narrows by the search and an account on the server and sums up what was found', async () => {
    answer = (params) =>
      params.get('q') === 'такси' && params.get('accountIds') === 'cash'
        ? page([T2, T8], { summary: { count: 2, netMinor: -10_900_000, usd: { present: false, missingRate: false } } })
        : page([T1, T2, T3, T4, T8]);
    await renderHistory();

    await type('такси');
    await press('Наличные');

    expect(lastRequest().get('q')).toBe('такси');
    expect(lastRequest().get('accountIds')).toBe('cash');
    expect(button('Наличные').getAttribute('aria-pressed')).toBe('true');
    expect(text()).toContain(`2 операции · ${MINUS}109${NBSP}000${NBSP}сум`);
    expect(text()).not.toContain('Супермаркет');

    // A pressed account chip is let go by a second press
    await press('Наличные');
    expect(lastRequest().get('accountIds')).toBeNull();
    expect(button('Наличные').getAttribute('aria-pressed')).toBe('false');
  });

  it('the category chip opens the filter: «Все категории», then expenses and income; the choice shows on the chip', async () => {
    answer = (params) => (params.get('categoryIds') === 'c-cafe' ? page([T4], { summary: { count: 1, netMinor: -14_500_000, usd: { present: false, missingRate: false } } }) : page([T1, T4]));
    await renderHistory();

    await press('Фильтр по категории');
    expect(text()).toContain('Все категории');
    expect(text()).toContain('Расходы');
    expect(text()).toContain('Доходы');

    await act(async () => [...document.body.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((tile) => tile.textContent === 'Кафе')!.click());
    await settle();

    expect(lastRequest().get('categoryIds')).toBe('c-cafe');
    expect(button('Категория: Кафе. Изменить фильтр').textContent).toContain('Кафе');
    expect(text()).toContain(`1 операция · ${MINUS}145${NBSP}000${NBSP}сум`);

    await press('Сбросить');
    expect(lastRequest().toString()).toBe('');
    expect(button('Фильтр по категории')).toBeTruthy();
  });

  it('nothing found says what was searched, and one press resets the search and the filters', async () => {
    answer = (params) =>
      params.has('q') ? page([], { summary: { count: 0, netMinor: 0, usd: { present: false, missingRate: false } } }) : page([T1, T2]);
    await renderHistory();

    await type('такси');
    await press('Доллары');

    expect(text()).toContain('Ничего не нашлось');
    expect(text()).toContain('Ничего нет по запросу «такси», на счёте «Доллары». Попробуйте другое слово или снимите фильтр.');
    expect(document.body.querySelector('[role="status"]')).toBeTruthy();

    await press('Сбросить поиск и фильтры');

    expect(searchInput().value).toBe('');
    expect(lastRequest().toString()).toBe('');
    expect(button('Доллары').getAttribute('aria-pressed')).toBe('false');
    expect(text()).toContain('Супермаркет');
  });

  it('clears the search with its own button', async () => {
    answer = (params) => (params.has('q') ? page([T2]) : page([T1, T2]));
    await renderHistory();

    await type('такси');
    expect(text()).not.toContain('Супермаркет');

    await press('Очистить поиск');
    expect(searchInput().value).toBe('');
    expect(text()).toContain('Супермаркет');
  });

  it('an empty history leads to the first record, with nothing to reset', async () => {
    answer = () => page([]);
    await renderHistory();

    expect(text()).toContain('Пока нет операций');
    expect(text()).toContain('Запишите первую трату на главной — она появится здесь.');
    expect(buttons().some((item) => item.textContent?.includes('Сбросить'))).toBe(false);
  });

  it('reads the next page by its cursor when the end of the list comes into view', async () => {
    answer = (params) =>
      params.get('cursor') === 'after-t3'
        ? page([T4, T8])
        : page([T1, T2, T3], { nextCursor: 'after-t3' });
    await renderHistory();

    // Yesterday may go on on the next page: its total waits for it
    expect(text()).not.toContain('Итог дня: +12');
    expect(text()).not.toContain('Обед с командой');

    await act(async () => observers.forEach((callback) => callback([{ isIntersecting: true }])));
    await settle();

    expect(lastRequest().get('cursor')).toBe('after-t3');
    expect(text()).toContain('Обед с командой · Карта');
    expect(text()).toContain(`Итог дня: +12${NBSP}355${NBSP}000${NBSP}сум`);
  });

  it('a row opens its record sheet, its category circle the choice of a category', async () => {
    await renderHistory();

    await press(`Продукты, ${MINUS}186${NBSP}400${NBSP}сум, Супермаркет, Карта. Открыть`);
    expect(useRecordSheetStore.getState().target).toMatchObject({ id: 't1', view: 'sheet' });

    act(() => useRecordSheetStore.setState({ target: null }));
    await press(`Сменить категорию: Продукты, ${MINUS}186${NBSP}400${NBSP}сум`);
    expect(useRecordSheetStore.getState().target).toMatchObject({ id: 't1', view: 'category' });
  });

  it('keeps the record just changed in a filtered list until the filter changes', async () => {
    let cafe = [T4];
    answer = (params) => (params.get('categoryIds') === 'c-cafe' ? page(cafe) : page([T1, T4]));
    await renderHistory();
    await press('Фильтр по категории');
    await act(async () => [...document.body.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((tile) => tile.textContent === 'Кафе')!.click());
    await settle();

    // The circle: the category changes to «Продукты», and the filter «Кафе» no longer finds the record
    await press(`Сменить категорию: Кафе, ${MINUS}145${NBSP}000${NBSP}сум`);
    act(() => useRecordSheetStore.setState({ target: null }));
    cafe = [];
    await act(async () => {
      client.setQueryData(transactionKeys.record('t4'), { ...T4, categoryId: 'c-food', category: 'Продукты' });
      await client.invalidateQueries({ queryKey: transactionKeys.history(USER_ID) });
    });
    await settle();

    expect(text()).toContain('Обед с командой');
    expect(text()).not.toContain('Ничего не нашлось');

    await press('Карта');
    expect(text()).not.toContain('Обед с командой');
  });
});
