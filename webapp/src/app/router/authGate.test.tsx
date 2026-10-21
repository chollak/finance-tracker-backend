// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { useUserStore } from '@/entities/user';
import { apiClient } from '@/shared/api';
import { authDecision } from './authDecision';
import { appRoutes } from './appRoutes';

/**
 * FT-128, decision Д4: there is no guest mode. A browser without a session sees the login screen at whatever address
 * it opened, and that address opens once the bot confirmed the login. While the session is still being checked the
 * app shows its loading, not the login. The device checks under /dev stay outside.
 */

vi.mock('@/shared/api/client', () => {
  const pending = () => new Promise<never>(() => {});
  return { apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending) }, onSessionLost: vi.fn() };
});

const LOGIN_TITLE = 'Траты и доходы — голосом, текстом и фото чека';

let root: Root;
let container: HTMLDivElement;

beforeAll(async () => {
  await import('@/pages');
}, 60_000);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.mocked(apiClient.get).mockReset();
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url === '/auth/web-login') return { success: true, data: { status: 'none' } } as never;
    return new Promise<never>(() => {});
  });
  useUserStore.setState({ userId: null, userName: null, username: null, userType: null, telegramId: null, signedOut: false });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function open(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );
  });
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  return router;
}

const title = () => document.body.querySelector('h1')?.textContent?.trim();
const reads = () => vi.mocked(apiClient.get).mock.calls.map(([url]) => url);

describe('the gate before the app', () => {
  it('decides by who is known: a user — the app; nobody, checked — the login; nobody yet — wait', () => {
    expect(authDecision({ userId: '597843119', signedOut: false })).toBe('app');
    expect(authDecision({ userId: null, signedOut: true })).toBe('login');
    expect(authDecision({ userId: null, signedOut: false })).toBe('wait');
  });

  it('a browser without a session gets the login screen at any address, and nothing of the app is read', async () => {
    useUserStore.setState({ signedOut: true });

    const router = await open('/analytics');

    expect(title()).toBe(LOGIN_TITLE);
    expect(router.state.location.pathname).toBe('/analytics');
    expect(reads().filter((url) => url !== '/auth/web-login')).toEqual([]);
  });

  it('while the session is checked it waits, without flashing the login', async () => {
    await open('/');

    expect(title()).not.toBe(LOGIN_TITLE);
    expect(document.body.textContent).not.toContain('Войти через Telegram');
  });

  it('once signed in, the address it was opened at goes on to the app', async () => {
    useUserStore.setState({ signedOut: true });
    await open('/analytics');

    await act(async () => {
      useUserStore.getState().setSessionUser({ telegramId: '597843119', firstName: 'Шукур', username: 'shukur' });
    });

    expect(title()).not.toBe(LOGIN_TITLE);
    // The app's own gate reads the settings for the first launch
    expect(reads()).toContain('/settings');
  });

  it('the device checks under /dev open without a session', async () => {
    useUserStore.setState({ signedOut: true });
    await open('/dev/pastel');

    expect(title()).not.toBe(LOGIN_TITLE);
  });
});
