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
import { useUndoToastStore } from '@/shared/lib/undo';
import { CAFE } from '../model/fixtures';
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
const CATEGORIES: Category[] = [{ id: 'kf', name: 'Кафе', color: 'rose', type: 'expense', isHidden: false, isOther: false, sortOrder: 0, presetKey: 'cafe' }];
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
let root: Root;
let container: HTMLDivElement;
let router: ReturnType<typeof createMemoryRouter>;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  answer = CAFE;
  vi.mocked(apiClient.get).mockReset();
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url === '/categories') return { success: true, data: CATEGORIES } as never;
    if (url === '/accounts') return { success: true, data: ACCOUNTS } as never;
    if (url === '/analytics/categories/kf?month=2026-10') {
      if (answer === 'missing') throw { message: 'Category not found', statusCode: 404 };
      return { success: true, data: answer } as never;
    }
    return new Promise<never>(() => {});
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

  it('a category that is not the user’s says so and leads back to Analytics', async () => {
    answer = 'missing';
    await renderCategory();

    expect(text()).toContain('Такой категории нет');
    expect(button('К аналитике')).toBeTruthy();
  });
});
