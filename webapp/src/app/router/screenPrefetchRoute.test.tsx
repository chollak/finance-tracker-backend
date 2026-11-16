// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { useUserStore } from '@/entities/user';
import { apiClient } from '@/shared/api';
import { appRoutes } from './appRoutes';
import { pageLoaders, SCREENS_AFTER_HOME, type PageKey } from './pageLoaders';

/**
 * #291: Home drawn, the code of the screens it leads to loads ahead — the first move to a screen then does not wait
 * for its piece. Not before: the login, the first launch and another screen opened straight away load only their own.
 * The tests run in this order: the load ahead happens once per app, and the last tests are the ones that open Home.
 */

vi.mock('@/shared/api/client', () => {
  const pending = () => new Promise<never>(() => {});
  return { apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending) }, onSessionLost: vi.fn() };
});

const USER_ID = '900000291';
const KEYS = Object.keys(pageLoaders) as PageKey[];

let root: Root;
let container: HTMLDivElement;
let onboardedAt: string | null;
let loaders: Record<PageKey, ReturnType<typeof vi.spyOn>>;

// Every page's code once here, so a slow first import (a busy test run) does not decide
beforeAll(async () => {
  await Promise.all(KEYS.map((key) => pageLoaders[key]()));
  loaders = Object.fromEntries(KEYS.map((key) => [key, vi.spyOn(pageLoaders, key)])) as typeof loaders;
}, 60_000);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // The idle moment comes soon, as in a browser: a few frames later
  vi.stubGlobal('requestIdleCallback', (run: () => void) => setTimeout(run, 50));
  vi.stubGlobal('cancelIdleCallback', (id: number) => clearTimeout(id));
  onboardedAt = '2026-10-01T09:00:00.000Z';
  vi.mocked(apiClient.get).mockReset();
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url === '/settings') return { success: true, data: { onboardedAt } } as never;
    if (url === '/auth/web-login') return { success: true, data: { status: 'none' } } as never;
    // Every other read is refused at once: the server is there, a screen draws its own state
    throw Object.assign(new Error('Internal Server Error'), { statusCode: 500 });
  });
  useUserStore.setState({ userId: USER_ID, userType: 'telegram', telegramId: USER_ID, userName: 'Test', signedOut: false });
  for (const key of KEYS) loaders[key].mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const squash = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() ?? '';
const text = () => squash(document.body.textContent);
const title = () => squash(document.body.querySelector('h1')?.textContent);
const called = () => KEYS.filter((key) => loaders[key].mock.calls.length > 0);

async function wait(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function until(predicate: () => boolean, timeout = 10_000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error(`Timed out; the screen says: ${text().slice(0, 300)}`);
    await wait(20);
  }
}

async function open(path: string) {
  // A failed read is tried once more, as in the app (QueryProvider), only sooner
  const client = new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 100 } } });
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );
  });
  return router;
}

describe('before Home', () => {
  it('another screen opened straight away loads only its own code', async () => {
    await open('/more');
    await until(() => title() === 'Ещё');
    await wait(300);

    expect(called()).toEqual(['more']);
  });

  it('the login loads only its own code', async () => {
    useUserStore.setState({ userId: null, userType: null, telegramId: null, userName: null, signedOut: true });

    await open('/');
    await until(() => title() !== '');
    await wait(300);

    expect(called()).toEqual(['login']);
  });

  it('the first launch loads only its own code', async () => {
    onboardedAt = null;

    await open('/');
    await until(() => title() === 'Сколько у вас сейчас денег?');
    await wait(300);

    expect(called()).toEqual(['firstLaunch']);
  });
});

describe('Home drawn on a bad connection', () => {
  // Review of PR #377: the month's totals got no answer, Home asked for them again as it drew its sections, and the
  // screens loaded ahead while that read was on its way — a failed piece would then break the screens that need it
  it('a read of Home that gets no answer at all: nothing loads ahead', async () => {
    const answer = vi.mocked(apiClient.get).getMockImplementation()!;
    vi.mocked(apiClient.get).mockImplementation(async (url: string, ...rest) => {
      if (url.startsWith('/transactions/totals')) throw Object.assign(new Error('Network Error'), { statusCode: 0 });
      return answer(url, ...rest);
    });

    await open('/');
    await until(() => document.body.querySelector('[aria-label="Быстрый ввод"]') !== null);
    await wait(1500);

    expect(called()).toEqual(['home']);
  }, 15_000);
});

describe('Home drawn', () => {
  it('loads the code of the screens it leads to, one after another — not the showcase', async () => {
    await open('/');
    await until(() => document.body.querySelector('[aria-label="Быстрый ввод"]') !== null);
    await until(() => SCREENS_AFTER_HOME.every((key) => loaders[key].mock.calls.length > 0));

    // Home's own code came in the test before (`lazy()` keeps it); now the screens it leads to, and only they
    expect(called()).toEqual(KEYS.filter((key) => SCREENS_AFTER_HOME.includes(key)));
    expect(SCREENS_AFTER_HOME).not.toContain('pastelShowcase');
    expect(SCREENS_AFTER_HOME).not.toContain('login');
    expect(SCREENS_AFTER_HOME).not.toContain('firstLaunch');
    expect(SCREENS_AFTER_HOME).not.toContain('home');
  }, 15_000);

  it('Home shown again loads nothing more', async () => {
    await open('/');
    await until(() => document.body.querySelector('[aria-label="Быстрый ввод"]') !== null);
    await wait(300);

    // Home's own code is in already: `lazy()` keeps it
    expect(called()).toEqual([]);
  }, 15_000);
});
