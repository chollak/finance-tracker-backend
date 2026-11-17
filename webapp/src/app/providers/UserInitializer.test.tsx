// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUserStore } from '@/entities/user';
import { apiClient, onMiniAppRefused, onSessionLost } from '@/shared/api';
import { memoryOfflineStorage, offlineStorage, setOfflineStorage } from '@/shared/lib/offline';
import { UserInitializer } from './UserInitializer';

/**
 * FT-128: who the app opens for. Inside Telegram — the Mini App's user; in a browser — the session the bot confirmed
 * (`GET /api/auth/session`), and without one the login screen. There is no guest any more (decision Д4). A 401 later:
 * in a browser the session ended — the login screen; inside Telegram the initData is refused (#316) — the app asks to
 * open the Mini App again.
 */

vi.mock('@/shared/api/client', () => {
  const pending = () => new Promise<never>(() => {});
  return { apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending) }, onSessionLost: vi.fn(), onMiniAppRefused: vi.fn() };
});

const USER = { telegramId: '597843119', firstName: 'Шукур', username: 'shukur' };

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.mocked(apiClient.get).mockReset();
  vi.mocked(onSessionLost).mockReset();
  vi.mocked(onMiniAppRefused).mockReset();
  useUserStore.setState({ userId: null, userName: null, username: null, userType: null, telegramId: null, signedOut: false, miniAppRefused: false });
  setOfflineStorage(memoryOfflineStorage());
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

/** A read kept on the device for the offline mode (FT-129): what «forgetting the kept answers» takes away */
async function keepRead() {
  await offlineStorage().putRead({ hash: 'a', userId: '597843119', queryKey: ['accounts', 'list', '597843119'], data: {}, updatedAt: 1 });
}

const keptReads = () => offlineStorage().listReads('597843119');

async function start() {
  const client = new QueryClient();
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <UserInitializer />
      </QueryClientProvider>
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('in a browser', () => {
  it('signs in with the session the bot confirmed', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ success: true, data: { user: USER } } as never);

    await start();

    expect(apiClient.get).toHaveBeenCalledWith('/auth/session');
    expect(useUserStore.getState()).toMatchObject({ userId: '597843119', userName: 'Шукур', username: 'shukur', signedOut: false });
  });

  it('without a session: nobody, and the login screen — not a guest', async () => {
    vi.mocked(apiClient.get).mockRejectedValue({ statusCode: 401, message: 'Authorization header required' });

    await start();

    expect(useUserStore.getState()).toMatchObject({ userId: null, userType: null, signedOut: true });
  });

  it('a session that ended between visits also drops the answers kept on the device for it', async () => {
    useUserStore.setState({ userId: '597843119', userType: 'telegram', telegramId: '597843119', userName: 'Шукур' });
    vi.mocked(apiClient.get).mockRejectedValue({ statusCode: 401 });
    await keepRead();

    await start();

    expect(await keptReads()).toHaveLength(0);
  });

  // #322: the service worker keeps no API answers any more; what an earlier version kept is deleted at every start
  it('the API cache an earlier service worker left goes at start; the reads kept for the offline mode stay', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ success: true, data: { user: USER } } as never);
    const remove = vi.fn(async () => true);
    vi.stubGlobal('caches', { delete: remove });
    await keepRead();

    await start();

    expect(remove).toHaveBeenCalledWith('api-cache');
    expect(await keptReads()).toHaveLength(1);
  });

  it('a session that ended since the last visit takes the remembered user away', async () => {
    useUserStore.setState({ userId: '597843119', userType: 'telegram', telegramId: '597843119', userName: 'Шукур' });
    vi.mocked(apiClient.get).mockRejectedValue({ statusCode: 401 });

    await start();

    expect(useUserStore.getState()).toMatchObject({ userId: null, signedOut: true });
  });

  it('no answer (no network): the remembered user stays; without one, the login screen', async () => {
    useUserStore.setState({ userId: '597843119', userType: 'telegram', telegramId: '597843119', userName: 'Шукур' });
    vi.mocked(apiClient.get).mockRejectedValue({ statusCode: 0, message: 'Network error' });

    await start();
    expect(useUserStore.getState()).toMatchObject({ userId: '597843119', signedOut: false });
  });

  it('when the server stops taking the session later, the login screen shows and the kept answers go', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ success: true, data: { user: USER } } as never);
    await keepRead();
    await start();
    expect(await keptReads()).toHaveLength(1);

    const lost = vi.mocked(onSessionLost).mock.calls.at(-1)?.[0];
    expect(lost).toEqual(expect.any(Function));
    await act(async () => lost?.());

    expect(useUserStore.getState()).toMatchObject({ userId: null, signedOut: true, miniAppRefused: false });
    expect(await keptReads()).toHaveLength(0);
  });
});

describe('inside Telegram', () => {
  it('the Mini App\'s user, without asking for a session', async () => {
    vi.stubGlobal('Telegram', {
      WebApp: {
        initData: 'query_id=1&hash=abc',
        initDataUnsafe: { user: { id: 597843119, first_name: 'Шукур', username: 'shukur' } },
        ready: vi.fn(),
        expand: vi.fn(),
      },
    });

    await start();

    expect(apiClient.get).not.toHaveBeenCalled();
    expect(useUserStore.getState()).toMatchObject({ userId: '597843119', userName: 'Шукур', signedOut: false, miniAppRefused: false });
  });

  // #316: initData lives 24 hours and Telegram renews it only when the Mini App is opened again
  it('when the server stops taking its initData, the app asks to open it again; the user and the kept answers stay', async () => {
    vi.stubGlobal('Telegram', {
      WebApp: {
        initData: 'query_id=1&hash=abc',
        initDataUnsafe: { user: { id: 597843119, first_name: 'Шукур', username: 'shukur' } },
        ready: vi.fn(),
        expand: vi.fn(),
      },
    });
    const remove = vi.fn(async () => true);
    vi.stubGlobal('caches', { delete: remove });
    await keepRead();
    await start();
    // #322: the old service worker's API cache goes at start inside Telegram too
    expect(remove).toHaveBeenCalledWith('api-cache');

    const refused = vi.mocked(onMiniAppRefused).mock.calls.at(-1)?.[0];
    expect(refused).toEqual(expect.any(Function));
    await act(async () => refused?.());

    expect(useUserStore.getState()).toMatchObject({ userId: '597843119', signedOut: false, miniAppRefused: true });
    expect(await keptReads()).toHaveLength(1);
  });

  it('a fresh start knows nothing of an earlier refusal: it is not kept on the device', () => {
    useUserStore.getState().setMiniAppRefused();

    expect(useUserStore.persist.getOptions().partialize?.(useUserStore.getState())).not.toHaveProperty('miniAppRefused');
  });
});
