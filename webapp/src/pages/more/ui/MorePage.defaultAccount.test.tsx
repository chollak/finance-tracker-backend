// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { Account, AccountsOverview } from '@/entities/account';
import { STARTER_CATEGORIES } from '@/entities/category/model/fixtures';
import type { UsdRates } from '@/entities/rate';
import type { UserSettings } from '@/entities/settings';
import { pendingRecordsOf } from '@/entities/transaction';
import { useUserStore } from '@/entities/user';
import { ManualEntry } from '@/features/manual-entry';
import { Composer, useCaptureStore } from '@/features/quick-capture';
import { apiClient } from '@/shared/api';
import { memoryOfflineStorage, setOfflineStorage, useConnectivityStore, useOutboxStore } from '@/shared/lib/offline';
import { useUndoToastStore } from '@/shared/lib/undo';
import { MorePage } from './MorePage';

/**
 * FT-149: the default account chosen in «Ещё» is where new records go at once — the quick chips, a phrase written
 * without a connection and manual entry read the same settings the choice changed, before the server answers. A phrase
 * sent online names no account: the server picks the default from the saved setting (`accountBook.resolveForRecord`).
 * One app: «Ещё», Home's composer and manual entry over one query cache, the API answered here.
 */

vi.mock('@/shared/api/client', () => {
  const pending = () => new Promise<never>(() => {});
  return {
    apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending), getFile: vi.fn(pending) },
  };
});

const USER_ID = '900000001';

const account = (overrides: Partial<Account>): Account => ({
  id: 'card', name: 'Карта', kind: 'card', currency: 'UZS', openingBalanceMinor: 0, openingDate: '2026-08-01', isHidden: false, sortOrder: 10, balanceMinor: 0, ...overrides,
});
// «Карта» first: without a choice, records go to it
const ACCOUNTS: AccountsOverview = {
  accounts: [account({ id: 'card' }), account({ id: 'cash', name: 'Наличные', kind: 'cash', sortOrder: 20 })],
  totalMinor: 0,
  rate: null,
  missingRate: false,
};
const RATES: UsdRates = { effective: { rateMinor: 1_265_000, source: 'cbu', date: '2026-10-14' }, cbu: null, own: null };
const SETTINGS: UserSettings = {
  userId: 'u1', theme: 'telegram', dailySummaryEnabled: true, dailySummaryTime: '21:00', auditEnabled: true, auditTime: '10:00',
  goalAlertsEnabled: true, fxOwnRateMinor: null, fxOwnSince: null, defaultAccountId: null, onboardedAt: '2026-10-01T09:00:00.000Z',
  receiptTipsSeen: 0, auditInviteSnoozedUntil: null, displayCurrency: 'UZS',
};

let settings: UserSettings;
let root: Root;
let container: HTMLDivElement;
let router: ReturnType<typeof createMemoryRouter>;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  settings = SETTINGS;
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url === '/accounts') return { success: true, data: ACCOUNTS } as never;
    if (url === '/rates/usd') return { success: true, data: RATES } as never;
    if (url === '/categories') return { success: true, data: STARTER_CATEGORIES } as never;
    if (url === '/settings') return { success: true, data: settings } as never;
    if (url === '/transactions/frequent') return { success: true, data: { items: [] } } as never;
    return new Promise<never>(() => {});
  });
  vi.mocked(apiClient.patch).mockReset();
  vi.mocked(apiClient.post).mockReset();
  vi.mocked(apiClient.patch).mockImplementation(async (_url: string, patch: unknown) => {
    settings = { ...settings, ...(patch as Partial<UserSettings>) };
    return { success: true, data: settings } as never;
  });
  vi.mocked(apiClient.post).mockImplementation(async (_url: string, body: unknown) => {
    const record = body as Record<string, unknown>;
    return { success: true, data: { id: 'r1', transaction: { ...record, id: 'r1', category: record.category } } } as never;
  });
  useUserStore.setState({ userId: USER_ID, userType: 'telegram', telegramId: USER_ID, userName: 'Шукур', username: null, signedOut: false });
  useUndoToastStore.setState({ stack: [], openSheets: 0 });
  useCaptureStore.setState({ draft: '', review: null });
  setOfflineStorage(memoryOfflineStorage());
  useOutboxStore.setState({ entries: [] });
  useConnectivityStore.setState({ browserOnline: true, lost: false });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mountApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  router = createMemoryRouter(
    [
      { path: '/more', element: <MorePage /> },
      { path: '/', element: <Composer /> },
      { path: '/add', element: <ManualEntry /> },
    ],
    { initialEntries: ['/more'] }
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

async function go(path: string) {
  await act(async () => {
    await router.navigate(path);
  });
  await settle();
}

async function press(element: Element | null | undefined) {
  if (!element) throw new Error('Nothing to press');
  await act(async () => (element as HTMLElement).click());
  await settle();
}

const button = (label: string) =>
  [...document.body.querySelectorAll<HTMLElement>('button')].find(
    (item) => item.getAttribute('aria-label') === label || item.querySelector('[data-row-text] > span')?.textContent === label || item.querySelector('span > span')?.textContent === label
  );

/** «Ещё» → «Счёт по умолчанию» → the account. */
async function chooseDefault(name: string) {
  await press(button('Счёт по умолчанию'));
  const option = [...document.body.querySelectorAll('[role="dialog"] [role="radio"]')].find((item) => item.querySelector('span > span')?.textContent === name);
  await press(option);
}

const chip = (name: string) => [...container.querySelectorAll('[aria-label="Частые операции"] button')].find((item) => item.querySelector('span')?.textContent === name);

describe('the default account chosen in «Ещё» (FT-149)', () => {
  it('a quick chip writes to it', async () => {
    await mountApp();
    await chooseDefault('Наличные');
    expect(apiClient.patch).toHaveBeenCalledWith('/settings', { defaultAccountId: 'cash' });

    await go('/');
    await press(chip('Кофе'));

    expect(apiClient.post).toHaveBeenCalledWith('/transactions', expect.objectContaining({ description: 'Кофе', accountId: 'cash' }), expect.anything());
  });

  it('a phrase written without a connection goes to it', async () => {
    await mountApp();
    await chooseDefault('Наличные');

    await go('/');
    useConnectivityStore.setState({ browserOnline: false });
    await act(async () => useCaptureStore.getState().setDraft('такси 18к'));
    await press(button('Записать без связи'));

    expect(pendingRecordsOf(USER_ID).map((record) => [record.note, record.accountId])).toEqual([['Такси', 'cash']]);
  });

  it('manual entry starts on it', async () => {
    await mountApp();
    await chooseDefault('Наличные');

    await go('/add');

    const chosen = container.querySelector('[role="radiogroup"][aria-label="Счёт"] [role="radio"][aria-checked="true"]');
    expect(chosen?.textContent).toContain('Наличные');
  });

  it('it applies before the server answers', async () => {
    vi.mocked(apiClient.patch).mockImplementation(() => new Promise<never>(() => {}));
    await mountApp();
    await chooseDefault('Наличные');

    await go('/add');

    const chosen = container.querySelector('[role="radiogroup"][aria-label="Счёт"] [role="radio"][aria-checked="true"]');
    expect(chosen?.textContent).toContain('Наличные');
  });

  it('without a choice, the first visible account is where records go', async () => {
    await mountApp();

    await go('/add');

    const chosen = container.querySelector('[role="radiogroup"][aria-label="Счёт"] [role="radio"][aria-checked="true"]');
    expect(chosen?.textContent).toContain('Карта');
  });
});
