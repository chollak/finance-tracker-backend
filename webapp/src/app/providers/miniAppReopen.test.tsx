// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUserStore } from '@/entities/user';
import { apiClient } from '@/shared/api';
import { authDecision } from '../router/authDecision';
import { MiniAppReopenGate } from './MiniAppReopenGate';
import { UserInitializer } from './UserInitializer';
import { AppProviders } from './index';

/**
 * #316 from the request to the screen, with the real API client: Telegram gives the Mini App its initData once, when it
 * is opened, and the server takes it for 24 hours. A Mini App left open longer gets 401 on every request; the app then
 * shows one screen, «Откройте Kapelka заново», whose button closes the Mini App. In a browser a 401 is still the end of
 * the session and leads to the login screen (FT-128). The app under the gate stands in for the router: it says what
 * `AuthGate` would decide.
 */

vi.mock('@/shared/config/env', () => ({
  env: { apiBaseUrl: '/api', isDevelopment: false, isProduction: true, mockUserId: null, mockUserName: 'Dev' },
}));

const REOPEN_TITLE = 'Откройте Kapelka заново';
const USER = { telegramId: '597843119', firstName: 'Шукур', username: 'shukur' };

let root: Root;
let container: HTMLDivElement;
let close: ReturnType<typeof vi.fn>;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const refusedSignIn = (code: string) => json(401, { success: false, error: 'refused', code });
const title = () => container.querySelector('h1')?.textContent?.trim() ?? null;
const app = () => container.querySelector('[data-testid="app"]')?.textContent ?? null;

function App() {
  const decision = useUserStore((state) => authDecision({ userId: state.userId, signedOut: state.signedOut }));
  return <p data-testid="app">{decision}</p>;
}

async function settle() {
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function start() {
  const client = new QueryClient();
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <UserInitializer />
        <MiniAppReopenGate>
          <App />
        </MiniAppReopenGate>
      </QueryClientProvider>
    );
  });
  await settle();
}

/** A screen's read, as any of them sends it. */
async function read(endpoint: string) {
  await act(async () => {
    await apiClient.get(endpoint).catch(() => undefined);
  });
  await settle();
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  useUserStore.setState({ userId: null, userName: null, username: null, userType: null, telegramId: null, signedOut: false, miniAppRefused: false });
  vi.stubGlobal('caches', { delete: vi.fn(async () => true) });
  close = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('inside Telegram', () => {
  beforeEach(() => {
    vi.stubGlobal('Telegram', {
      WebApp: {
        initData: 'query_id=1&auth_date=1&hash=abc',
        initDataUnsafe: { user: { id: 597843119, first_name: 'Шукур' } },
        ready: vi.fn(),
        expand: vi.fn(),
        close,
      },
    });
  });

  it('the app opens as before while the server takes the initData', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { success: true, data: [] })));
    await start();

    await read('/accounts');

    expect(app()).toBe('app');
    expect(title()).toBeNull();
  });

  it.each(['INIT_DATA_EXPIRED', 'INVALID_AUTH'])('a 401 %s shows «Откройте Kapelka заново» instead of the app', async (code) => {
    vi.stubGlobal('fetch', vi.fn(async () => refusedSignIn(code)));
    await start();
    expect(app()).toBe('app');

    await read('/transactions/totals');

    expect(title()).toBe(REOPEN_TITLE);
    expect(app()).toBeNull();
    expect(useUserStore.getState()).toMatchObject({ userId: '597843119', signedOut: false });
  });

  it('its button closes the Mini App', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => refusedSignIn('INIT_DATA_EXPIRED')));
    await start();
    await read('/accounts');

    const button = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === 'Закрыть Kapelka');
    await act(async () => button?.click());

    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('in a browser', () => {
  it('a 401 still ends the session: the login screen, never the reopen screen (FT-128)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url === '/api/auth/session' ? json(200, { success: true, data: { user: USER } }) : refusedSignIn('MISSING_AUTH_HEADER')))
    );
    await start();
    expect(app()).toBe('app');

    await read('/accounts');

    expect(app()).toBe('login');
    expect(title()).toBeNull();
    expect(useUserStore.getState().miniAppRefused).toBe(false);
  });
});

describe('the providers around the router', () => {
  it('put the reopen screen in the app\'s place once the Mini App is refused', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Promise<never>(() => {})));
    await act(async () =>
      root.render(
        <AppProviders>
          <p data-testid="app">the app</p>
        </AppProviders>
      )
    );
    await settle();
    expect(app()).toBe('the app');

    await act(async () => useUserStore.getState().setMiniAppRefused());

    expect(title()).toBe(REOPEN_TITLE);
    expect(app()).toBeNull();
  });
});
