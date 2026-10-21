// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUserStore } from '@/entities/user';
import { apiClient, onSessionLost } from '@/shared/api';
import { UserInitializer } from './UserInitializer';

/**
 * FT-128: who the app opens for. Inside Telegram — the Mini App's user; in a browser — the session the bot confirmed
 * (`GET /api/auth/session`), and without one the login screen. There is no guest any more (decision Д4).
 */

vi.mock('@/shared/api/client', () => {
  const pending = () => new Promise<never>(() => {});
  return { apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending) }, onSessionLost: vi.fn() };
});

const USER = { telegramId: '597843119', firstName: 'Шукур', username: 'shukur' };

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.mocked(apiClient.get).mockReset();
  vi.mocked(onSessionLost).mockReset();
  useUserStore.setState({ userId: null, userName: null, username: null, userType: null, telegramId: null, signedOut: false });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

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

  it('a session that ended between visits also drops the API answers the service worker kept for it', async () => {
    useUserStore.setState({ userId: '597843119', userType: 'telegram', telegramId: '597843119', userName: 'Шукур' });
    vi.mocked(apiClient.get).mockRejectedValue({ statusCode: 401 });
    const forget = vi.fn(async () => true);
    vi.stubGlobal('caches', { delete: forget });

    await start();

    expect(forget).toHaveBeenCalledWith('api-cache');
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

  it('when the server stops taking the session later, the login screen shows and the cached API answers go', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ success: true, data: { user: USER } } as never);
    const forget = vi.fn(async () => true);
    vi.stubGlobal('caches', { delete: forget });
    await start();
    expect(forget).not.toHaveBeenCalled();

    const lost = vi.mocked(onSessionLost).mock.calls.at(-1)?.[0];
    expect(lost).toEqual(expect.any(Function));
    await act(async () => lost?.());

    expect(useUserStore.getState()).toMatchObject({ userId: null, signedOut: true });
    expect(forget).toHaveBeenCalledWith('api-cache');
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
    expect(useUserStore.getState()).toMatchObject({ userId: '597843119', userName: 'Шукур', signedOut: false });
  });
});
