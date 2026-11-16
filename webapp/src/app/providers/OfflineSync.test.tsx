// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUserStore } from '@/entities/user';
import {
  memoryOfflineStorage,
  offlineStorage,
  setOfflineStorage,
  useConnectivityStore,
  useOutboxStore,
  type OutboxRow,
} from '@/shared/lib/offline';
import { useUndoToastStore } from '@/shared/lib/undo';
import { OfflineSync } from './OfflineSync';
import { OFFLINE_SYNC_INTERVAL_MS } from './startOfflineSync';
import { UserInitializer } from './UserInitializer';

/**
 * #385: inside Telegram, once the server refuses the Mini App's initData (#316), every request gets 401 until the Mini
 * App is opened again. The records waiting in the outbox (FT-129) wait for that opening too: while «Откройте Kapelka
 * заново» stands nothing is sent — not every 15 seconds, not when the connection comes back — so the server's log gets
 * no `warn initData expired` per try and the request limit is not spent. The records stay as they were and go after
 * the new opening, oldest first. With the real API client and the real outbox: only `fetch` stands for the server.
 */

vi.mock('@/shared/config/env', () => ({
  env: { apiBaseUrl: '/api', isDevelopment: false, isProduction: true, mockUserId: null, mockUserName: 'Dev' },
}));

const USER = '597843119';
const record = (clientId: string, createdAt: number, note: string): OutboxRow => ({
  clientId,
  userId: USER,
  createdAt,
  body: { type: 'expense', amountMinor: 1_800_000, currency: 'UZS', categoryName: 'Транспорт', date: '2026-11-16', note, writtenAt: createdAt },
});
const TAXI = record('q1', 1, 'Такси');
const BUS = record('q2', 2, 'Автобус');

let root: Root | null = null;
let container: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const refused = () => json(401, { success: false, error: 'initData expired', code: 'INIT_DATA_EXPIRED' });

/** The records sent, as `POST /api/transactions` got them. */
const sentNotes = () =>
  fetchMock.mock.calls
    .filter(([url, init]) => url === '/api/transactions' && init?.method === 'POST')
    .map(([, init]) => (JSON.parse(String(init?.body)) as { description: string }).description);

async function settle() {
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** The offline sync's clock: only its interval is faked. */
async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await settle();
}

function setBrowserOnline(online: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

/** Opens the Mini App: a page of its own, with what the device kept from before. */
async function open() {
  root = createRoot(container);
  const page = root;
  await act(async () =>
    page.render(
      <QueryClientProvider client={new QueryClient()}>
        <UserInitializer />
        <OfflineSync />
      </QueryClientProvider>
    )
  );
  await settle();
}

/** Closes it: the page and what it held in memory go — the refusal too, it is not kept; the device keeps the outbox. */
function close() {
  const page = root;
  act(() => page?.unmount());
  root = null;
  useOutboxStore.setState({ entries: [] });
  useUserStore.setState({ miniAppRefused: false });
}

/** Opened with records waiting since before, and the server refuses its initData. */
async function openRefused() {
  await offlineStorage().putOutbox([TAXI, BUS]);
  await open();
  expect(sentNotes()).toEqual(['Такси']);
  expect(useUserStore.getState().miniAppRefused).toBe(true);
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
  useUserStore.setState({ userId: null, userName: null, username: null, userType: null, telegramId: null, signedOut: false, miniAppRefused: false });
  setOfflineStorage(memoryOfflineStorage());
  useOutboxStore.setState({ entries: [] });
  useConnectivityStore.setState({ browserOnline: true, lost: false });
  useUndoToastStore.getState().clear();
  onlineManager.setOnline(true);
  vi.stubGlobal('Telegram', {
    WebApp: {
      initData: 'query_id=1&auth_date=1&hash=abc',
      initDataUnsafe: { user: { id: 597843119, first_name: 'Шукур' } },
      ready: vi.fn(),
      expand: vi.fn(),
      close: vi.fn(),
    },
  });
  fetchMock = vi.fn(async () => refused());
  vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  close();
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  onlineManager.setOnline(true);
});

describe('while «Откройте Kapelka заново» stands', () => {
  it('the waiting records are not sent again every 15 seconds', async () => {
    await openRefused();

    await wait(OFFLINE_SYNC_INTERVAL_MS * 4);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('nor when the connection comes back', async () => {
    await openRefused();

    setBrowserOnline(false);
    await settle();
    setBrowserOnline(true);
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('the records stay as they were: in the outbox and on the device, none taken back, none refused', async () => {
    await openRefused();

    await wait(OFFLINE_SYNC_INTERVAL_MS * 4);

    expect(useOutboxStore.getState().entries).toEqual([TAXI, BUS]);
    expect(await offlineStorage().listOutbox(USER)).toEqual([TAXI, BUS]);
    expect(useUndoToastStore.getState().stack).toEqual([]);
  });
});

describe('after the Mini App is opened again', () => {
  it('the waiting records go as before, oldest first, and leave the outbox', async () => {
    await openRefused();
    await wait(OFFLINE_SYNC_INTERVAL_MS * 2);
    close();
    const sentBefore = sentNotes().length;
    let next = 0;
    fetchMock.mockImplementation(async () => json(201, { success: true, data: { id: `t${(next += 1)}` } }));

    await open();

    expect(sentNotes().slice(sentBefore)).toEqual(['Такси', 'Автобус']);
    expect(useUserStore.getState().miniAppRefused).toBe(false);
    expect(useOutboxStore.getState().entries).toEqual([]);
    expect(await offlineStorage().listOutbox(USER)).toEqual([]);
  });
});
