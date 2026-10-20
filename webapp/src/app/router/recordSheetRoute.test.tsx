// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, matchRoutes, RouterProvider } from 'react-router-dom';
import type { ReactNode } from 'react';
import { HomePage, TransactionsPage } from '@/pages';
import { accountKeys } from '@/entities/account';
import { categoryKeys } from '@/entities/category';
import { transactionKeys } from '@/entities/transaction';
import { useUserStore } from '@/entities/user';
import { useRecordSheetStore } from '@/features/record-sheet';
import { ROUTES } from '@/shared/lib/constants/routes';
import { monthBounds, toLocalDate } from '@/shared/lib/dates';
import { MINUS, NBSP } from '@/shared/lib/money';
import type { Transaction } from '@/shared/types';
import { RECENT_LIMIT } from '@/widgets/recent-transactions';
import { appRoutes } from './appRoutes';

/**
 * FT-115: the record sheet replaces the edit page. /transactions/:id/edit is gone; a link to a record —
 * the bot's «Изменить» — opens Home with that record's sheet.
 */

// Reads Home does not need here never answer, so nothing reaches the network
vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  const pending = () => new Promise<never>(() => {});
  return { ...actual, apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), delete: vi.fn(pending) } };
});

const USER_ID = '900000001';

const T4: Transaction = {
  id: 't4', type: 'expense', amount: 145000, amountMinor: 14_500_000, currency: 'UZS', category: 'Кафе', categoryId: 'c-cafe',
  accountId: 'card', date: toLocalDate(new Date()), description: 'Обед с командой', userId: USER_ID,
};

/** The route that renders an address: the deepest match of the app's route table. */
function screenAt(path: string): string | undefined {
  return matchRoutes(appRoutes, path)?.at(-1)?.route.path;
}

describe('routes', () => {
  it('the edit page /transactions/:id/edit is gone', () => {
    expect(screenAt('/transactions/t4/edit')).toBe('*');
  });

  it('a link to a record is Home with the record named', () => {
    expect(ROUTES.RECORD('t4')).toBe('/?record=t4');
    expect(screenAt(ROUTES.RECORD('t4').split('?')[0])).toBe(ROUTES.HOME);
  });
});

describe('ways to the record sheet', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    useUserStore.setState({ userId: USER_ID, userType: 'telegram', telegramId: USER_ID, userName: 'Шукур' });
    useRecordSheetStore.setState({ target: null, flashId: null });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  /** Home with its first reads answered: no accounts, nothing this month, one recent record (t4). */
  function homeData(): QueryClient {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const month = monthBounds(toLocalDate(new Date()));
    client.setQueryData(accountKeys.list(USER_ID), { accounts: [], totalMinor: 0, rate: null, missingRate: false });
    client.setQueryData(transactionKeys.totals(USER_ID, month), {
      ...month, incomeMinor: 0, expenseMinor: 0, netMinor: 0, recordCount: 0,
      needsReview: { count: 0, totalMinor: 0 }, excludedMovementsMinor: 0,
      usd: { present: false, missingRate: false, rateMinor: null },
    });
    client.setQueryData(transactionKeys.recent(USER_ID, RECENT_LIMIT), [T4]);
    client.setQueryData(categoryKeys.list(USER_ID), [
      { id: 'c-cafe', type: 'expense', name: 'Кафе', color: 'rose', isHidden: false, isOther: false, sortOrder: 20, presetKey: 'cafe' },
    ]);
    client.setQueryData(transactionKeys.record('t4'), T4);
    return client;
  }

  /** Home's reads, and History as it opens (FT-116): one page with t4, nothing narrowed. */
  function historyData(): QueryClient {
    const client = homeData();
    client.setQueryData(transactionKeys.history(USER_ID, { text: '', categoryId: null, accountId: null, type: null }), {
      pages: [{ items: [T4], nextCursor: null, summary: null }],
      pageParams: [null],
    });
    return client;
  }

  async function renderAt(client: QueryClient, path: string, element: ReactNode) {
    const router = createMemoryRouter([{ path: path.split('?')[0], element }], { initialEntries: [path] });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      );
    });
    return router;
  }

  function press(label: string): Promise<void> {
    const target = [...document.body.querySelectorAll<HTMLElement>('button, [role="button"]')].find(
      (item) => item.getAttribute('aria-label') === label
    );
    if (!target) throw new Error(`No button «${label}»`);
    return act(async () => target.click());
  }

  it('a link to a record opens Home with its sheet, and the address forgets it', async () => {
    const router = await renderAt(homeData(), ROUTES.RECORD('t4'), <HomePage />);

    expect(useRecordSheetStore.getState().target).toMatchObject({ id: 't4', view: 'sheet' });
    expect(document.body.textContent).toContain('Изменения сохраняются сразу');
    expect(router.state.location.search).not.toContain('record');
  });

  it('on Home a row opens the sheet, its category circle the choice of a category', async () => {
    await renderAt(homeData(), ROUTES.HOME, <HomePage />);

    await press(`Кафе, ${MINUS}145${NBSP}000${NBSP}сум, Обед с командой. Открыть`);
    expect(useRecordSheetStore.getState().target).toMatchObject({ id: 't4', view: 'sheet' });

    act(() => useRecordSheetStore.setState({ target: null }));
    await press(`Сменить категорию: Кафе, ${MINUS}145${NBSP}000${NBSP}сум`);
    expect(useRecordSheetStore.getState().target).toMatchObject({ id: 't4', view: 'category' });
    expect(document.body.textContent).toContain('Вся операция');
  });

  it('the row just changed is ringed on Home', async () => {
    await renderAt(homeData(), ROUTES.HOME, <HomePage />);

    act(() => useRecordSheetStore.setState({ flashId: 't4' }));

    const row = document.body.querySelector('li');
    expect(row?.className).toMatch(/ring-2/);
  });

  it('a sheet stays on the screen it was opened on: leaving History (Telegram «Назад») does not carry it to Home', async () => {
    const client = historyData();
    const router = createMemoryRouter(
      [
        { path: ROUTES.HOME, element: <HomePage /> },
        { path: ROUTES.TRANSACTIONS, element: <TransactionsPage /> },
      ],
      { initialEntries: [ROUTES.HOME, ROUTES.TRANSACTIONS], initialIndex: 1 }
    );
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      );
    });
    await press(`Кафе, ${MINUS}145${NBSP}000${NBSP}сум, Обед с командой. Открыть`);
    expect(document.body.textContent).toContain('Изменения сохраняются сразу');

    await act(async () => router.navigate(-1));

    expect(router.state.location.pathname).toBe(ROUTES.HOME);
    expect(document.body.textContent).not.toContain('Изменения сохраняются сразу');
    expect(useRecordSheetStore.getState().target).toBeNull();
  });

  it('in History a row opens the sheet too, its category circle the choice of a category (FT-116)', async () => {
    await renderAt(historyData(), ROUTES.TRANSACTIONS, <TransactionsPage />);

    await press(`Кафе, ${MINUS}145${NBSP}000${NBSP}сум, Обед с командой. Открыть`);

    expect(useRecordSheetStore.getState().target).toMatchObject({ id: 't4', view: 'sheet' });
    expect(document.body.textContent).toContain('Изменения сохраняются сразу');

    act(() => useRecordSheetStore.setState({ target: null }));
    await press(`Сменить категорию: Кафе, ${MINUS}145${NBSP}000${NBSP}сум`);
    expect(useRecordSheetStore.getState().target).toMatchObject({ id: 't4', view: 'category' });
  });
});
