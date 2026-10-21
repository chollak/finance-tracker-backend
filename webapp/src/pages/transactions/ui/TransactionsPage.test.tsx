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
import { recordLinkState, useRecordSheetStore } from '@/features/record-sheet';
import { apiClient } from '@/shared/api';
import { ROUTES } from '@/shared/lib/constants/routes';
import { addDays, dayMonth, toLocalDate } from '@/shared/lib/dates';
import { MINUS, NBSP } from '@/shared/lib/money';
import { useUndoToastStore } from '@/shared/lib/undo';
import type { Transaction } from '@/shared/types';
import { SEARCH_DELAY_MS } from '@/features/history-filters';
import { TransactionsPage } from './TransactionsPage';

/**
 * FT-116, boards «История», «История · «такси» + Наличные», «История · ничего не найдено»: search and filter chips
 * narrow History on the server (GET /api/transactions), page by page; days carry their totals; a row opens its
 * record sheet; nothing found says what was searched and resets it. The tabs «Текущие / Скрытые» and «Скрыть все»
 * are gone. Rendered in jsdom with the history API answered here.
 */

// The client itself: the record sheet deletes and restores through the data source, which imports it directly
vi.mock('@/shared/api/client', () => {
  const pending = () => new Promise<never>(() => {});
  return { apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), delete: vi.fn(pending) } };
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
const BOARD_ACCOUNTS: Account[] = [account('cash', 'Наличные', 'UZS', 10), account('card', 'Карта', 'UZS', 20), account('usd', 'Доллары', 'USD', 30)];
let ACCOUNTS: Account[] = BOARD_ACCOUNTS;

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
const T5 = record({ id: 't5', categoryId: 'c-cafe', category: 'Кафе', amountMinor: 2_500_000, description: 'Кофе', accountId: 'card' });
const T8 = record({ id: 't8', categoryId: 'c-tr', category: 'Транспорт', amountMinor: 8_500_000, date: addDays(TODAY, -2), description: 'Такси в аэропорт', accountId: 'cash' });

const page = (items: Transaction[], extra: Partial<HistoryPage> = {}): HistoryPage => ({ items, nextCursor: null, summary: null, ...extra });

/** What the history API answers, by the request's parameters. */
let answer: (params: URLSearchParams) => HistoryPage;
let requests: URLSearchParams[];
/** Every GET, in order; and what `GET /transactions/:id` answers: the record, 404 for null, no answer when not here. */
let gets: string[];
let server: Record<string, Transaction | null>;

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
  gets = [];
  server = {};
  answer = () => page([T1, T2, T3, T4, T8]);
  ACCOUNTS = BOARD_ACCOUNTS;
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    gets.push(url);
    const [path, search = ''] = url.split('?');
    const one = /^\/transactions\/([^/]+)$/.exec(path);
    if (one) {
      if (!(one[1] in server)) return new Promise<never>(() => {});
      if (server[one[1]]) return { success: true, data: server[one[1]] } as never;
      throw { statusCode: 404, message: 'Transaction not found' };
    }
    if (path !== '/transactions') return new Promise<never>(() => {});
    const params = new URLSearchParams(search);
    requests.push(params);
    return { success: true, data: answer(params) } as never;
  });
  useUserStore.setState({ userId: USER_ID, userType: 'telegram', telegramId: USER_ID, userName: 'Шукур' });
  useRecordSheetStore.setState({ target: null, flashId: null });
  useUndoToastStore.setState({ stack: [], openSheets: 0 });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

let router: ReturnType<typeof createMemoryRouter>;

async function renderHistory(entry: string | { pathname: string; search: string; state?: unknown } = ROUTES.TRANSACTIONS) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  router = createMemoryRouter([{ path: ROUTES.TRANSACTIONS, element: <TransactionsPage /> }], {
    initialEntries: [entry],
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

  it('opened from the account screen: that account’s chip on, the record’s sheet open on the record as listed', async () => {
    answer = (params) => (params.get('accountIds') === 'card' ? page([T1, T3, T4]) : page([T1, T2, T3, T4, T8]));
    const [pathname, search] = ROUTES.ACCOUNT_RECORD('card', 't1').split('?');
    await renderHistory({ pathname, search: `?${search}`, state: recordLinkState(T1) });

    // Narrowed from the first read: the whole history is never asked for
    expect(requests.map((params) => params.get('accountIds'))).toEqual(['card']);
    expect(button('Карта').getAttribute('aria-pressed')).toBe('true');
    expect(text()).not.toContain('Такси');
    expect(useRecordSheetStore.getState().target).toMatchObject({ id: 't1', view: 'sheet', seed: T1 });
    // The record leaves the address; the account stays
    expect(Object.fromEntries(new URLSearchParams(router.state.location.search))).toEqual({ account: 'card' });

    // The chip lets go as any other
    act(() => useRecordSheetStore.setState({ target: null }));
    await press('Карта');
    expect(lastRequest().get('accountIds')).toBeNull();
  });

  it('the record opened from the account screen stays in the list after it is moved to another account', async () => {
    // The record sheet reads the record: it is on «Наличные» now, and the filter no longer finds it
    server = { t1: { ...T1, accountId: 'cash' } };
    answer = (params) => (params.get('accountIds') === 'card' ? page([T3, T4]) : page([T1, T2, T3, T4, T8]));
    const [pathname, search] = ROUTES.ACCOUNT_RECORD('card', 't1').split('?');
    await renderHistory({ pathname, search: `?${search}`, state: recordLinkState(T1) });
    await settle();

    expect(button(`Продукты, ${MINUS}186${NBSP}400${NBSP}сум, Супермаркет, Наличные. Открыть`)).toBeTruthy();
  });

  it('narrowed by a hidden account, its chip stays at the end, on, so it can be let go', async () => {
    ACCOUNTS = [...BOARD_ACCOUNTS, { ...account('old', 'Старая карта', 'UZS', 40), isHidden: true }];
    await renderHistory({ pathname: ROUTES.TRANSACTIONS, search: '?account=old' });

    const chips = [...document.body.querySelectorAll<HTMLButtonElement>('[role="group"] button[aria-pressed]')];
    expect(chips.map((chip) => [chip.textContent, chip.getAttribute('aria-pressed')])).toEqual([
      ['Наличные', 'false'],
      ['Карта', 'false'],
      ['Доллары', 'false'],
      ['Старая карта', 'true'],
    ]);
    expect(lastRequest().get('accountIds')).toBe('old');

    await press('Старая карта');
    expect(lastRequest().get('accountIds')).toBeNull();
    expect(buttons().some((item) => item.textContent === 'Старая карта')).toBe(false);
  });

  it('the type chip, last in the row, opens «Все / Расходы / Доходы»; the choice goes to the server and shows on the chip', async () => {
    answer = (params) =>
      params.get('type') === 'income'
        ? page([T3], { summary: { count: 1, netMinor: 1_250_000_000, usd: { present: false, missingRate: false } } })
        : page([T1, T3]);
    await renderHistory();

    const chips = [...document.body.querySelectorAll<HTMLButtonElement>('[role="group"][aria-label="Фильтры"] > button')];
    expect(chips.map((chip) => chip.textContent)).toEqual(['Категория', 'Наличные', 'Карта', 'Доллары', 'Тип']);

    await press('Фильтр по типу');
    const options = [...document.body.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(options.map((option) => [option.textContent, option.getAttribute('aria-checked')])).toEqual([
      ['Все', 'true'],
      ['Расходы', 'false'],
      ['Доходы', 'false'],
    ]);

    await act(async () => options[2].click());
    await settle();

    expect(lastRequest().get('type')).toBe('income');
    expect(button('Тип: Доходы. Изменить фильтр').textContent).toBe('Доходы');
    expect(text()).toContain(`1 операция · +12${NBSP}500${NBSP}000${NBSP}сум`);
    expect(text()).not.toContain('Супермаркет');

    await press('Сбросить');
    expect(lastRequest().has('type')).toBe(false);
    expect(button('Фильтр по типу').textContent).toBe('Тип');
  });

  it('nothing found among the type chosen says so', async () => {
    answer = (params) =>
      params.has('type') ? page([], { summary: { count: 0, netMinor: 0, usd: { present: false, missingRate: false } } }) : page([T1]);
    await renderHistory();

    await press('Фильтр по типу');
    await act(async () => [...document.body.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((option) => option.textContent === 'Доходы')!.click());
    await settle();

    expect(text()).toContain('Ничего нет среди доходов. Попробуйте другое слово или снимите фильтр.');
  });

  describe('the record just changed (FilterChips.md: it stays «пока фильтр не поменяют»)', () => {
    const FOUND = (items: Transaction[]) =>
      page(items, {
        summary: {
          count: items.length,
          netMinor: -items.reduce((sum, item) => sum + (item.amountMinor ?? 0), 0),
          usd: { present: false, missingRate: false },
        },
      });
    let cafe: Transaction[];

    /** Filter «Кафе», then the record «Обед с командой» changed to «Продукты»: the filter no longer finds it. */
    async function changeLunchOutOfCafe({ keepSheetOpen = false } = {}) {
      cafe = [T4, T5];
      server = { t4: T4 };
      answer = (params) => (params.get('categoryIds') === 'c-cafe' ? FOUND(cafe) : page([T1, T4, T5]));
      await renderHistory();
      await press('Фильтр по категории');
      await act(async () => [...document.body.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((tile) => tile.textContent === 'Кафе')!.click());
      await settle();
      expect(text()).toContain(`2 операции · ${MINUS}170${NBSP}000${NBSP}сум`);

      await press(`Кафе, ${MINUS}145${NBSP}000${NBSP}сум, Обед с командой, Карта. Открыть`);
      if (!keepSheetOpen) act(() => useRecordSheetStore.setState({ target: null }));
      const changed = { ...T4, categoryId: 'c-food', category: 'Продукты' };
      server = { t4: changed };
      cafe = [T5];
      await act(async () => {
        client.setQueryData(transactionKeys.record('t4'), changed);
        await client.invalidateQueries({ queryKey: transactionKeys.history(USER_ID) });
      });
      await settle();
    }

    it('stays in the filtered list, and the line under the chips counts it', async () => {
      await changeLunchOutOfCafe();

      expect(text()).toContain('Обед с командой');
      expect(text()).toContain('Кофе');
      expect(text()).not.toContain('Ничего не нашлось');
      expect(text()).toContain(`2 операции · ${MINUS}170${NBSP}000${NBSP}сум`);
    });

    it('is gone once a chip changes, and stays gone when the chip is changed back', async () => {
      await changeLunchOutOfCafe();

      await press('Карта');
      expect(text()).not.toContain('Обед с командой');

      await press('Карта');
      expect(lastRequest().get('categoryIds')).toBe('c-cafe');
      expect(lastRequest().has('accountIds')).toBe(false);
      expect(text()).toContain('Кофе');
      expect(text()).not.toContain('Обед с командой');
      expect(text()).toContain(`1 операция · ${MINUS}25${NBSP}000${NBSP}сум`);
    });

    it('is gone once the search changes, and stays gone when the search is cleared', async () => {
      await changeLunchOutOfCafe();

      await type('коф');
      expect(lastRequest().get('q')).toBe('коф');
      expect(text()).not.toContain('Обед с командой');

      await press('Очистить поиск');
      expect(lastRequest().has('q')).toBe(false);
      expect(text()).toContain('Кофе');
      expect(text()).not.toContain('Обед с командой');
    });

    it('deleted from its sheet, leaves the list without being asked for again; «Отменить» brings it back', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue({ success: true, data: null } as never);
      vi.mocked(apiClient.post).mockResolvedValue({ success: true, data: null } as never);
      await changeLunchOutOfCafe({ keepSheetOpen: true });
      expect(text()).toContain('Обед с командой');

      const before = gets.length;
      server = { t4: null };
      await press('Удалить операцию');
      await settle();

      expect(useRecordSheetStore.getState().target).toBeNull();
      expect(text()).not.toContain('Обед с командой');
      expect(gets.slice(before).filter((url) => url.startsWith('/transactions/t4'))).toEqual([]);

      server = { t4: { ...T4, categoryId: 'c-food', category: 'Продукты' } };
      await act(async () => useUndoToastStore.getState().undoVisible());
      await settle();

      expect(apiClient.post).toHaveBeenCalledWith('/transactions/t4/restore');
      expect(text()).toContain('Обед с командой');
      expect(gets.slice(before).filter((url) => url.startsWith('/transactions/t4'))).toEqual([]);
    });
  });
});
