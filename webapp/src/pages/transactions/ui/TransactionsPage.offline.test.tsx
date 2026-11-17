// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, onlineManager, type QueryClient } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { useUserStore } from '@/entities/user';
import { apiClient } from '@/shared/api';
import { ROUTES } from '@/shared/lib/constants/routes';
import { createOfflineQueryClient, useConnectivityStore } from '@/shared/lib/offline';
import { READ_OFFLINE_TEXT } from '@/shared/ui/pastel';
import { TransactionsPage } from './TransactionsPage';

/**
 * #322: History is not kept on the device for the offline mode (FT-129), and the service worker no longer answers it
 * from a cache. Without a connection it must not stay on its skeleton: it says «Не удалось загрузить операции» under
 * the «Нет связи» line, offers to read again, and reads by itself when the connection is back. Rendered with the
 * app's own query client, where that rule lives.
 */

vi.mock('@/shared/api/client', () => {
  const pending = () => new Promise<never>(() => {});
  return { apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), delete: vi.fn(pending) } };
});
vi.mock('@/entities/category', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/category')>();
  return { ...actual, useCategories: () => ({ data: [] }) };
});
vi.mock('@/entities/account', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/account')>();
  return { ...actual, useAccounts: () => ({ data: { accounts: [], totalMinor: 0, rate: null, missingRate: false } }) };
});
vi.mock('@/entities/rate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/rate')>();
  return { ...actual, useUsdRate: () => ({ data: undefined }) };
});

const USER_ID = '900000001';
const NO_ANSWER = { message: 'Network error', statusCode: 0 };
const RECORD = { id: 't1', type: 'expense', amount: 24_000, amountMinor: 2_400_000, currency: 'UZS', category: 'Транспорт', description: 'Такси', date: '2026-11-17', userId: USER_ID };

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

async function settle(ms = 0) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function renderHistory() {
  client = createOfflineQueryClient();
  const router = createMemoryRouter([{ path: ROUTES.TRANSACTIONS, element: <TransactionsPage /> }], { initialEntries: [ROUTES.TRANSACTIONS] });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );
  });
  await settle(20);
}

const text = () => document.body.textContent ?? '';
const retry = () => [...document.body.querySelectorAll('button')].find((item) => item.textContent?.trim() === 'Попробовать снова');

describe('History without a connection', () => {
  beforeEach(() => {
    setBrowserOnline(false);
    vi.mocked(apiClient.get).mockReset().mockRejectedValue(NO_ANSWER);
  });

  it('says it could not load, under the «Нет связи» line, instead of staying on the skeleton', async () => {
    await renderHistory();

    expect(text()).toContain('Не удалось загрузить операции.');
    expect(text()).not.toContain('Загружаем операции…');
    expect([...document.body.querySelectorAll('[role="status"]')].map((item) => item.textContent)).toContain(READ_OFFLINE_TEXT);
    expect(retry()).toBeDefined();
  });

  it('«Попробовать снова» asks again and, still without a connection, says the same', async () => {
    await renderHistory();
    const asked = vi.mocked(apiClient.get).mock.calls.length;

    await act(async () => retry()?.click());
    await settle(20);

    expect(vi.mocked(apiClient.get).mock.calls.length).toBe(asked + 1);
    expect(text()).toContain('Не удалось загрузить операции.');
  });

  it('loads by itself when the connection is back; the line goes', async () => {
    await renderHistory();
    vi.mocked(apiClient.get).mockResolvedValue({ success: true, data: { items: [RECORD], nextCursor: null, summary: null } } as never);

    await act(async () => setBrowserOnline(true));
    await settle(20);

    expect(text()).toContain('Такси');
    expect(text()).not.toContain('Не удалось загрузить операции.');
    expect(text()).not.toContain(READ_OFFLINE_TEXT);
  });
});

describe('History when the server fails with a connection', () => {
  it('says it could not load without the «Нет связи» line', async () => {
    setBrowserOnline(true);
    vi.mocked(apiClient.get).mockReset().mockRejectedValue({ message: 'Internal error', statusCode: 500 });
    await renderHistory();
    await settle(1200); // the one retry

    expect(text()).toContain('Не удалось загрузить операции.');
    expect(text()).not.toContain(READ_OFFLINE_TEXT);
  });
});
