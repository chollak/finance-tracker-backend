// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onlineManager, QueryClient } from '@tanstack/react-query';
import { accountKeys } from '@/entities/account';
import { transactionKeys } from '@/entities/transaction';
import {
  addToOutbox,
  connectionLost,
  memoryOfflineStorage,
  offlineStorage,
  setOfflineStorage,
  useConnectivityStore,
  useOutboxStore,
} from '@/shared/lib/offline';
import { savedReadUser } from './savedReadKeys';
import { startOfflineSync } from './startOfflineSync';

/**
 * FT-129: what keeps the app working without a connection. Records written offline go when the connection is back —
 * at the start, on the browser's `online`, and every few seconds while some wait or the server is not answering;
 * going offline fills the reads that have nothing from what was kept on the device; TanStack Query follows the
 * browser's connection, so reads wait instead of failing.
 */

const USER = '900000001';
const INTERVAL = 15_000;

let stop: (() => void) | null = null;
let queryClient: QueryClient;
const flush = vi.fn();
const probe = vi.fn();

function setBrowserOnline(online: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

function start(): void {
  stop = startOfflineSync({ queryClient, userId: USER, flush, probe, intervalMs: INTERVAL });
}

const waiting = () => addToOutbox([{ clientId: 'q1', userId: USER, createdAt: 1, body: {} }]);
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
  setOfflineStorage(memoryOfflineStorage());
  useOutboxStore.setState({ entries: [] });
  useConnectivityStore.setState({ browserOnline: true, lost: false });
  onlineManager.setOnline(true);
  queryClient = new QueryClient();
  flush.mockReset().mockResolvedValue(undefined);
  probe.mockReset().mockResolvedValue(false);
});

afterEach(() => {
  stop?.();
  stop = null;
  vi.useRealTimers();
  onlineManager.setOnline(true);
});

describe('records waiting in the outbox', () => {
  it('go at the start when there is a connection', async () => {
    await waiting();

    start();
    await settle();

    expect(flush).toHaveBeenCalledWith(queryClient, USER);
  });

  it('wait while the device is offline and go as soon as it is back online', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    await waiting();
    start();
    await settle();
    expect(flush).not.toHaveBeenCalled();

    setBrowserOnline(true);
    await settle();

    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('are tried again every few seconds while some still wait', async () => {
    await waiting();
    start();
    await settle();

    await vi.advanceTimersByTimeAsync(INTERVAL);

    expect(flush).toHaveBeenCalledTimes(2);
  });
});

describe('a server that stopped answering', () => {
  it('is asked every few seconds; its answer brings the app back online', async () => {
    start();
    connectionLost();
    probe.mockResolvedValue(true);

    await vi.advanceTimersByTimeAsync(INTERVAL);

    expect(probe).toHaveBeenCalled();
    expect(useConnectivityStore.getState().lost).toBe(false);
  });

  it('is not asked while the device itself is offline', async () => {
    start();
    setBrowserOnline(false);
    connectionLost();

    await vi.advanceTimersByTimeAsync(INTERVAL);

    expect(probe).not.toHaveBeenCalled();
  });
});

describe('going offline', () => {
  it('fills the reads that have nothing from what was kept on the device', async () => {
    await offlineStorage().putRead({
      hash: JSON.stringify(accountKeys.list(USER)),
      userId: USER,
      queryKey: [...accountKeys.list(USER)],
      data: { totalMinor: 974_300_000 },
      updatedAt: 1,
    });
    start();

    setBrowserOnline(false);
    await settle();

    expect(queryClient.getQueryData(accountKeys.list(USER))).toEqual({ totalMinor: 974_300_000 });
  });

  it('makes the reads wait for the connection instead of failing', async () => {
    start();

    setBrowserOnline(false);

    expect(onlineManager.isOnline()).toBe(false);
  });

  it('a device that starts offline is offline for the reads from the start', () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });

    start();

    expect(onlineManager.isOnline()).toBe(false);
  });
});

describe('what is kept on the device', () => {
  it('Home’s and the accounts’ reads of this user, and nothing else', () => {
    const month = { from: '2026-10-01', to: '2026-10-31' };

    expect(savedReadUser(accountKeys.list(USER))).toBe(USER);
    expect(savedReadUser(transactionKeys.totals(USER, month))).toBe(USER);
    expect(savedReadUser(transactionKeys.recent(USER, 5))).toBe(USER);
    expect(savedReadUser(transactionKeys.frequent(USER))).toBe(USER);
    expect(savedReadUser(['categories', 'list', USER])).toBe(USER);
    expect(savedReadUser(['rates', 'usd', USER])).toBe(USER);
    expect(savedReadUser(['settings', USER])).toBe(USER);

    expect(savedReadUser(transactionKeys.history(USER, { text: '', categoryId: null, accountId: null, type: null }))).toBeNull();
    expect(savedReadUser(accountKeys.operations(USER, 'card'))).toBeNull();
    expect(savedReadUser(transactionKeys.record('t1'))).toBeNull();
  });
});
