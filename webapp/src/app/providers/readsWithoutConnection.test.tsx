// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, onlineManager, type QueryClient } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { useUserStore } from '@/entities/user';
import { AccountPage } from '@/pages/accounts';
import { CategoryAnalyticsPage } from '@/pages/analytics';
import { CAFE } from '@/pages/analytics/model/fixtures';
import { apiClient } from '@/shared/api';
import { createOfflineQueryClient, useConnectivityStore } from '@/shared/lib/offline';
import { READ_OFFLINE_TEXT } from '@/shared/ui/pastel';

/**
 * #322, review of PR #418: the account screen and a category of analytics name a `retry` of their own (not after a
 * 404). Without a connection they must not stay on «Загружаем счёт…» / «Загружаю категорию…» either: the rule «no
 * retry without a connection» is the query client's, around whatever `retry` a read names. Rendered with the app's
 * own query client; the reads themselves are the real ones.
 */

vi.mock('@/shared/api/client', () => {
  const pending = () => new Promise<never>(() => {});
  return { apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending) } };
});

const USER_ID = '900000001';
const NO_ANSWER = { message: 'Network error', statusCode: 0 };
const CARD = { id: 'card', name: 'Карта', kind: 'card', currency: 'UZS', openingBalanceMinor: 0, openingDate: '2026-08-01', isHidden: false, sortOrder: 20, balanceMinor: 31_800_000 };
const ACCOUNTS = { accounts: [CARD], totalMinor: 31_800_000, rate: null, missingRate: false };

/** What the server answers once the connection is back. */
async function server(url: string): Promise<never> {
  const [path] = url.split('?');
  if (path === '/accounts') return { success: true, data: ACCOUNTS } as never;
  if (path === '/categories') return { success: true, data: [] } as never;
  if (path === '/accounts/card/operations') return { success: true, data: { account: { ...CARD, hasOperations: false }, days: [] } } as never;
  if (path.startsWith('/analytics/categories/')) return { success: true, data: CAFE } as never;
  return new Promise<never>(() => {});
}

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

function setBrowserOnline(online: boolean) {
  onlineManager.setOnline(online);
  useConnectivityStore.setState({ browserOnline: online, lost: false });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  useUserStore.setState({ userId: USER_ID, userType: 'telegram', telegramId: USER_ID, userName: 'Шукур' });
  setBrowserOnline(false);
  vi.mocked(apiClient.get).mockReset().mockRejectedValue(NO_ANSWER);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  client.clear();
  setBrowserOnline(true);
  vi.unstubAllGlobals();
});

async function settle(ms = 30) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function open(path: string, route: string, element: ReactElement) {
  client = createOfflineQueryClient();
  const router = createMemoryRouter([{ path: route, element }], { initialEntries: [path] });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );
  });
  await settle();
}

const text = () => document.body.textContent ?? '';
const statuses = () => [...document.body.querySelectorAll('[role="status"]')].map((item) => item.textContent);
const retry = () => [...document.body.querySelectorAll('button')].find((item) => item.textContent?.trim() === 'Попробовать снова');
const asked = (path: string) => vi.mocked(apiClient.get).mock.calls.filter(([url]) => String(url).startsWith(path)).length;

describe.each([
  {
    screen: 'the account screen',
    path: '/accounts/card',
    route: '/accounts/:id',
    element: <AccountPage />,
    read: '/accounts/card/operations',
    failed: 'Не удалось загрузить счёт.',
    loading: 'Загружаем счёт',
    loaded: 'Карта',
  },
  {
    screen: 'a category of analytics',
    path: '/analytics/categories/kf?month=2026-10',
    route: '/analytics/categories/:id',
    element: <CategoryAnalyticsPage />,
    read: '/analytics/categories/kf',
    failed: 'Не удалось загрузить категорию.',
    loading: 'Загружаю категорию',
    loaded: CAFE.category.name,
  },
])('$screen without a connection', ({ path, route, element, read, failed, loading, loaded }) => {
  it('says it could not load, under the «Нет связи» line, and asked once — no retry waits for the connection', async () => {
    await open(path, route, element);

    expect(text()).toContain(failed);
    expect(statuses().join(' ')).not.toContain(loading);
    expect(statuses()).toContain(READ_OFFLINE_TEXT);
    expect(retry()).toBeDefined();
    expect(asked(read)).toBe(1);
  });

  it('«Попробовать снова» asks again and says the same', async () => {
    await open(path, route, element);

    await act(async () => retry()?.click());
    await settle();

    expect(asked(read)).toBe(2);
    expect(text()).toContain(failed);
  });

  it('loads by itself when the connection is back', async () => {
    await open(path, route, element);
    vi.mocked(apiClient.get).mockImplementation(server);

    await act(async () => setBrowserOnline(true));
    await settle();

    expect(text()).not.toContain(failed);
    expect(text()).not.toContain(READ_OFFLINE_TEXT);
    expect(text()).toContain(loaded);
  });
});
