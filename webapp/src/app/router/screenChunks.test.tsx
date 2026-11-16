// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { useUserStore } from '@/entities/user';
import { apiClient } from '@/shared/api';
import { appRoutes } from './appRoutes';
import { ignoreWindowScroll, squash, until } from './screenTesting';

/**
 * #291: every screen loads its own code, not one piece with all the screens. So Home does not wait for the code of
 * analytics, the categories or the showcase. Seen from here: when one screen's code does not load, that screen says
 * «Экран не открылся» (#240), and the others still open — before, every screen came from the `@/pages` barrel, and
 * one failing module took them all down.
 */

vi.mock('@/shared/api/client', () => {
  const pending = () => new Promise<never>(() => {});
  return { apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending) }, onSessionLost: vi.fn() };
});

// Only analytics' code is gone
vi.mock('@/pages/analytics', () => {
  throw new TypeError('Failed to fetch dynamically imported module: /webapp/assets/page-analytics-Bx1.js');
});

const USER_ID = '900000291';
const FAILED = 'Экран не открылся';

let root: Root;
let container: HTMLDivElement;
let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  ignoreWindowScroll();
  logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(apiClient.get).mockReset();
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url === '/settings') return { success: true, data: { onboardedAt: '2026-10-01T09:00:00.000Z' } } as never;
    if (url === '/auth/web-login') return { success: true, data: { status: 'none' } } as never;
    // Every other read fails at once: a screen then draws its own state instead of waiting
    throw Object.assign(new Error('Internal Server Error'), { status: 500 });
  });
  useUserStore.setState({ userId: USER_ID, userType: 'telegram', telegramId: USER_ID, userName: 'Test', signedOut: false });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  logged.mockRestore();
});

const title = () => squash(document.body.querySelector('h1')?.textContent);
/** A screen's code loads in these tests: on a busy run it takes longer than the other route tests wait. */
const LOAD_TIMEOUT = 10_000;

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
  return router;
}

describe('every screen loads its own code', () => {
  it('the screen whose code did not load says «Экран не открылся»', async () => {
    await open('/analytics');
    await until(() => title() === FAILED, LOAD_TIMEOUT);
  });

  it('another screen still opens', async () => {
    await open('/more');
    await until(() => title() !== '', LOAD_TIMEOUT);

    expect(title()).toBe('Ещё');
  }, 15_000);

  it('Home still opens', async () => {
    await open('/');
    // The composer is Home's own: past the skeleton, Home's code is in
    await until(() => document.body.querySelector('[aria-label="Быстрый ввод"]') !== null || title() === FAILED, LOAD_TIMEOUT);

    expect(title()).not.toBe(FAILED);
  }, 15_000);

  it('the login still opens', async () => {
    useUserStore.setState({ userId: null, userType: null, telegramId: null, userName: null, signedOut: true });

    await open('/');
    await until(() => title() !== '', LOAD_TIMEOUT);

    expect(title()).not.toBe(FAILED);
  }, 15_000);
});
