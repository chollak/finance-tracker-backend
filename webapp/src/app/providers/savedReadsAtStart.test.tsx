// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { accountKeys } from '@/entities/account';
import { useUserStore } from '@/entities/user';
import { memoryOfflineStorage, offlineStorage, setOfflineStorage } from '@/shared/lib/offline';
import { useSavedReadsAtStart } from './savedReadsAtStart';

/**
 * FT-129: an app that opens without a connection fills its reads from what was kept on the device before it shows its
 * screens, so Home and the accounts open on their data. Online it opens at once.
 */

const USER = '900000001';
let root: Root | null = null;
let container: HTMLDivElement;
let queryClient: QueryClient;
const seen: boolean[] = [];

function Probe() {
  seen.push(useSavedReadsAtStart(true));
  return null;
}

async function render(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>
    );
  });
}

function startOnline(online: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  queryClient = new QueryClient();
  seen.length = 0;
  setOfflineStorage(memoryOfflineStorage());
  await offlineStorage().putRead({
    hash: JSON.stringify(accountKeys.list(USER)),
    userId: USER,
    queryKey: [...accountKeys.list(USER)],
    data: { totalMinor: 974_300_000 },
    updatedAt: 1,
  });
  useUserStore.setState({ userId: USER, userType: 'telegram' });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  startOnline(true);
});

describe('the start of the app', () => {
  it('without a connection waits for the kept reads, then opens on them', async () => {
    startOnline(false);

    await render();

    expect(seen[0]).toBe(false);
    expect(seen.at(-1)).toBe(true);
    expect(queryClient.getQueryData(accountKeys.list(USER))).toEqual({ totalMinor: 974_300_000 });
  });

  it('online opens at once and reads from the server', async () => {
    startOnline(true);

    await render();

    expect(seen.every(Boolean)).toBe(true);
    expect(queryClient.getQueryData(accountKeys.list(USER))).toBeUndefined();
  });
});
