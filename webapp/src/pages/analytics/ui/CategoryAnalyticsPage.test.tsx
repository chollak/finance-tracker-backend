// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { CategoryAnalytics } from '@/entities/analytics';
import type { Category } from '@/entities/category';
import { useUserStore } from '@/entities/user';
import { useRecordSheetStore } from '@/features/record-sheet';
import { apiClient } from '@/shared/api';
import { useUndoToastStore, visibleEntry } from '@/shared/lib/undo';
import type { Transaction } from '@/shared/types';
import { CAFE, CAFE_RECORDS, daysOf } from '../model/fixtures';
import { CategoryAnalyticsPage } from './CategoryAnalyticsPage';

/**
 * FT-121, board «Аналитика · категория «Кафе»» and DayBars.md: a category of the month — its total and the insight
 * about it, spending by day with a day to choose, and its operations by day; a chosen day narrows the operations
 * and its chip clears it; an operation opens its record sheet. Rendered in jsdom with the API answered here.
 */

vi.mock('@/shared/api/client', () => {
  const pending = () => new Promise<never>(() => {});
  return { apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending) } };
});

const USER_ID = '900000001';
const category = (id: string, name: string, color: Category['color'], type: Category['type'], sortOrder: number): Category => ({
  id, name, color, type, isHidden: false, isOther: false, sortOrder, presetKey: null,
});
const CATEGORIES: Category[] = [
  category('pr', 'Продукты', 'peach', 'expense', 0),
  category('kf', 'Кафе', 'rose', 'expense', 1),
  category('fr', 'Фриланс', 'lilac', 'income', 0),
];
const ACCOUNTS = {
  accounts: [
    { id: 'card', name: 'Карта', kind: 'card', currency: 'UZS', openingBalanceMinor: 0, openingDate: '2026-08-01', isHidden: false, sortOrder: 20, balanceMinor: 0 },
    { id: 'cash', name: 'Наличные', kind: 'cash', currency: 'UZS', openingBalanceMinor: 0, openingDate: '2026-08-01', isHidden: false, sortOrder: 10, balanceMinor: 0 },
  ],
  totalMinor: 0,
  rate: null,
  missingRate: false,
};

let answer: CategoryAnalytics | 'missing';
/** The months the screen asked for, `null` — the current one. */
let asked: (string | null)[];
/**
 * The server's records, in the tests where the record sheet changes them: the answer for «Кафе» in October is then
 * counted from them, as FT-120 counts it — a record moved out of «Кафе» or out of October is not in it.
 */
let server: Map<string, Transaction> | null;

function liveCafe(): CategoryAnalytics {
  const records = [...server!.values()]
    .filter((record) => record.categoryId === 'kf' && record.date.startsWith('2026-10'))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  const amountMinor = records.reduce((sum, record) => sum + (record.amountMinor ?? 0), 0);
  return { ...CAFE, records, count: records.length, amountMinor, days: daysOf('2026-10', 31, records) };
}

let root: Root;
let container: HTMLDivElement;
let router: ReturnType<typeof createMemoryRouter>;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  answer = CAFE;
  asked = [];
  server = null;
  vi.mocked(apiClient.get).mockReset();
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url === '/categories') return { success: true, data: CATEGORIES } as never;
    if (url === '/accounts') return { success: true, data: ACCOUNTS } as never;
    const read = /^\/analytics\/categories\/\w+(?:\?month=(\d{4}-\d{2}))?$/.exec(url);
    if (read) {
      const month = read[1] ?? null;
      asked.push(month);
      if (answer === 'missing') throw { message: 'Category not found', statusCode: 404 };
      if (month && month > '2026-10') throw { message: 'month must not be after the current month', statusCode: 400 };
      return { success: true, data: server ? liveCafe() : answer } as never;
    }
    const record = /^\/transactions\/(\w+)$/.exec(url);
    if (record && server?.has(record[1])) return { success: true, data: server.get(record[1]) } as never;
    return new Promise<never>(() => {});
  });
  vi.mocked(apiClient.put).mockReset();
  vi.mocked(apiClient.put).mockImplementation(async (url: string, patch: unknown) => {
    const id = url.split('/').at(-1)!;
    const saved = { ...server!.get(id)!, ...(patch as Partial<Transaction>) };
    server!.set(id, saved);
    return { success: true, data: saved } as never;
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
});

async function renderCategory(path = '/analytics/categories/kf?month=2026-10') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  router = createMemoryRouter(
    [
      { path: '/analytics', element: <p>Аналитика месяца</p> },
      { path: '/analytics/categories/:id', element: <CategoryAnalyticsPage /> },
    ],
    { initialEntries: [path] }
  );
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );
  });
  await settle();
}

async function settle() {
  for (let step = 0; step < 3; step++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

const text = () => document.body.textContent?.replace(/[\s\u00a0]+/g, ' ') ?? '';
const buttons = () => [...document.body.querySelectorAll<HTMLButtonElement>('button')];
function button(name: string | RegExp): HTMLButtonElement {
  const matches = (value: string | null | undefined) => (typeof name === 'string' ? value?.replace(/\u00a0/g, ' ') === name : !!value && name.test(value.replace(/\u00a0/g, ' ')));
  const found = buttons().find((item) => matches(item.getAttribute('aria-label')) || matches(item.textContent?.trim()));
  if (!found) throw new Error(`No button «${name}» among: ${buttons().map((item) => item.getAttribute('aria-label') ?? item.textContent?.trim()).join(' | ')}`);
  return found;
}
/** A press as a pointer makes it (`detail: 1`) at a point, or as Enter makes it (`detail: 0`). */
async function press(name: string | RegExp, at?: { fraction: number }) {
  const target = button(name);
  await act(async () => {
    if (!at) {
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
      return;
    }
    target.getBoundingClientRect = () => ({ left: 0, top: 0, width: 280, height: 112, right: 280, bottom: 112, x: 0, y: 0, toJSON: () => ({}) });
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, clientX: at.fraction * 280 }));
  });
  await settle();
}
/** The headings of the day groups of the operations. */
const dayHeadings = () => [...document.body.querySelectorAll('section[aria-label="Операции"] h3')].map((heading) => heading.textContent);
/** A choice of the category picker (a Radix dialog in a portal). */
async function choose(name: string) {
  const option = [...document.body.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((item) => item.textContent?.includes(name));
  if (!option) throw new Error(`No choice «${name}»`);
  await act(async () => option.click());
  await settle();
}
const toastNow = () => visibleEntry(useUndoToastStore.getState().stack, Date.now());

describe('a category of the month (board «Аналитика · категория «Кафе»»)', () => {
  it('names the category and the days, the total, the share, the comparison and the insight', async () => {
    await renderCategory();

    expect(document.body.querySelector('h1')?.textContent).toBe('Кафе');
    expect(text()).toContain('1–14 октября');
    expect(text()).toContain('1 092 000 сум');
    expect(text()).toContain('14% расходов · 10 операций · в среднем 109 200 сум');
    expect(text()).toContain('↑ 40% к 1–14 сентября · на 312 000 сум больше');
    expect(text()).toContain('Больше половины — «Семейный ужин» и «Ужин с друзьями»');
  });

  it('draws spending by day and asks to choose a day', async () => {
    await renderCategory();

    expect(text()).toContain('По дням');
    expect(button('Траты по дням, 1–14 октября. Больше всего — 5 октября: 318 000 сум. Выбрать день')).toBeTruthy();
    expect(text()).toContain('Коснитесь столбца или выберите день стрелками');
  });

  it('lists the operations by day, newest first, the note leading and the account under it', async () => {
    await renderCategory();

    expect(dayHeadings().slice(0, 3)).toEqual(['Вчера, 13 октября', 'Воскресенье, 11 октября', 'Пятница, 9 октября']);
    expect(button(/^Обед с командой, −145 000 сум, Карта\. Открыть$/)).toBeTruthy();
    expect(text()).toContain('−145 000 сум');
  });

  it('a touch on a bar chooses its day: the readout, the chip and only that day’s operations', async () => {
    await renderCategory();

    await press(/^Траты по дням/, { fraction: 0.3 });

    expect(text()).toContain('318 000 сум · 1 операция');
    expect(button('Сбросить день: 5 октября')).toBeTruthy();
    expect(dayHeadings()).toEqual(['Понедельник, 5 октября']);
    expect(text()).toContain('Семейный ужин');
    expect(text()).not.toContain('Обед с командой');

    await press('Сбросить день: 5 октября');
    expect(dayHeadings()).toHaveLength(10);
    expect(text()).toContain('Коснитесь столбца или выберите день стрелками');
  });

  it('Enter chooses the largest day; the arrows step and a day without operations says so', async () => {
    await renderCategory();

    await press(/^Траты по дням/);
    expect(button('Сбросить день: 5 октября')).toBeTruthy();

    await press('Предыдущий день');
    expect(button('Сбросить день: 4 октября')).toBeTruthy();
    expect(text()).toContain('нет операций');
    expect(text()).toContain('В этот день операций нет');

    await press('Следующий день');
    await press('Следующий день');
    expect(button('Сбросить день: 6 октября')).toBeTruthy();
  });

  it('an operation opens its record sheet, its circle the choice of a category', async () => {
    await renderCategory();

    await press(/^Обед с командой, /);
    expect(useRecordSheetStore.getState().target).toMatchObject({ id: 'k13', view: 'sheet' });

    await act(async () => useRecordSheetStore.setState({ target: null }));
    await press(/^Сменить категорию: Кафе, −145 000 сум$/);
    expect(useRecordSheetStore.getState().target).toMatchObject({ id: 'k13', view: 'category' });
  });

  it('a single operation: no chart, the insight names its day', async () => {
    answer = { ...CAFE, count: 1, sharePercent: 3, amountMinor: 31_800_000, records: [CAFE.records[6]] };
    await renderCategory();

    expect(text()).not.toContain('По дням');
    expect(text()).toContain('Одна операция — 5 октября');
  });

  it('a category that is not the user’s says so and leads back to Analytics of its month', async () => {
    answer = 'missing';
    await renderCategory();

    expect(text()).toContain('Такой категории нет');
    await press('К аналитике');
    expect(`${router.state.location.pathname}${router.state.location.search}`).toBe('/analytics?month=2026-10');
  });
});

describe('«Ко всем категориям» of a category opened directly (a link, a reload)', () => {
  it('leads to the overview of the current month’s expenses', async () => {
    await renderCategory();

    await press('Ко всем категориям');
    expect(`${router.state.location.pathname}${router.state.location.search}`).toBe('/analytics');
  });

  it('a category of income of a past month leads to the income of that month', async () => {
    answer = {
      ...CAFE,
      month: '2026-09',
      period: { month: '2026-09', from: '2026-09-01', to: '2026-09-30', wholeMonth: true },
      previous: { month: '2026-08', from: '2026-08-01', to: '2026-08-31', wholeMonth: true },
      category: { id: 'fr', name: 'Фриланс', type: 'income' },
      count: 0,
      amountMinor: 0,
      days: daysOf('2026-09', 30, []),
      records: [],
    };
    await renderCategory('/analytics/categories/fr?month=2026-09');

    expect(document.body.querySelector('h1')?.textContent).toBe('Фриланс');
    await press('Ко всем категориям');
    expect(`${router.state.location.pathname}${router.state.location.search}`).toBe('/analytics?month=2026-09&type=income');
  });

  it('a month later than the current one is refused by the API: the screen shows the current month', async () => {
    await renderCategory('/analytics/categories/kf?month=2030-01');

    expect(asked).toEqual(['2030-01', null]);
    expect(router.state.location.search).toBe('');
    expect(text()).not.toContain('Не удалось загрузить категорию.');
    expect(text()).toContain('1–14 октября');
    expect(text()).toContain('1 092 000 сум');
  });
});

/**
 * Board «Аналитика · категория «Кафе»» (`keepId`): the record opened or changed here stays in the list while the
 * screen shows the same category and month — with its new category, at its new day (the chosen day goes with it);
 * moved out of the month it leaves, and closing its sheet says «Дата изменена» with «Отменить».
 */
describe('the record just opened or changed stays in the list', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 14, 12, 0, 0));
    server = new Map(CAFE_RECORDS.map((record) => [record.id!, record]));
  });

  afterEach(() => vi.useRealTimers());

  it('its category changed from its circle: the row stays, «Продукты · Карта» under its note, the total is the server’s', async () => {
    await renderCategory();

    await press(/^Сменить категорию: Кафе, −145 000 сум$/);
    await choose('Продукты');

    expect(vi.mocked(apiClient.put)).toHaveBeenCalledWith('/transactions/k13', { categoryId: 'pr' });
    const row = button(/^Обед с командой, −145 000 сум, Продукты, Карта\. Открыть$/);
    expect(row.textContent).toContain('Продукты · Карта');
    expect(button(/^Сменить категорию: Продукты, −145 000 сум$/)).toBeTruthy();
    expect(row.closest('li')?.className).toContain('ring-2');
    expect(dayHeadings()[0]).toBe('Вчера, 13 октября');
    // The numbers are the server's: «Кафе» has 9 operations now, and the day of the lunch has none of its own
    expect(text()).toContain('9 операций');
    expect(text()).toContain('Итог дня: 0 сум');
    expect(toastNow()).toMatchObject({ title: 'Категория изменена', detail: 'Кафе → Продукты' });

    // «Отменить» puts it back in «Кафе»
    await act(async () => useUndoToastStore.getState().undoVisible());
    await settle();
    expect(button(/^Обед с командой, −145 000 сум, Карта\. Открыть$/)).toBeTruthy();
    expect(text()).toContain('10 операций');
  });

  it('its date moved within the month: the chosen day goes with it', async () => {
    await renderCategory();
    await press(/^Траты по дням/, { fraction: 0.9 });
    expect(button('Сбросить день: 13 октября')).toBeTruthy();

    await press(/^Обед с командой, /);
    await press('Дата: Вчера, 13 октября. Изменить');
    await press('4 октября 2026');
    await press('Готово');

    expect(vi.mocked(apiClient.put)).toHaveBeenCalledWith('/transactions/k13', { date: '2026-10-04' });
    expect(button('Сбросить день: 4 октября')).toBeTruthy();
    expect(dayHeadings()).toEqual(['Воскресенье, 4 октября']);
    expect(button(/^Обед с командой, −145 000 сум, Карта\. Открыть$/).closest('li')?.className).toContain('ring-2');
    expect(toastNow()).toBeNull();
  });

  it('its date moved to September: it leaves, «Дата изменена» says where, «Отменить» brings it back', async () => {
    await renderCategory();

    await press(/^Обед с командой, /);
    await press('Дата: Вчера, 13 октября. Изменить');
    await press('Предыдущий месяц');
    await press('2 сентября 2026');
    await press('Готово');

    expect(text()).not.toContain('Обед с командой');
    expect(toastNow()).toMatchObject({ kind: 'changed', title: 'Дата изменена', detail: 'Перенесено на 2\u00a0сентября · −145\u00a0000\u00a0сум' });
    expect(text()).toContain('Дата изменена');

    await act(async () => useUndoToastStore.getState().undoVisible());
    await settle();
    expect(vi.mocked(apiClient.put)).toHaveBeenLastCalledWith('/transactions/k13', { date: '2026-10-13' });
    expect(dayHeadings()[0]).toBe('Вчера, 13 октября');
    expect(button(/^Обед с командой, −145 000 сум, Карта\. Открыть$/)).toBeTruthy();
  });
});
