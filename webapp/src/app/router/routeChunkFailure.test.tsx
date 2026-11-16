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
 * #240: the pages' code did not load — the usual cause right after Kapelka is updated, when the old pieces are gone.
 * Every screen that needed it, the login and the first launch included, shows «Экран не открылся» instead of the
 * router's technical page. The 404 screen and this one are in the main piece, so they still draw.
 */

const { FAILURE, gone } = vi.hoisted(() => {
  const message = 'Failed to fetch dynamically imported module: /webapp/assets/page-home-Bx1.js';
  return {
    FAILURE: message,
    gone: (): never => {
      throw new TypeError(message);
    },
  };
});

vi.mock('@/shared/api/client', () => {
  const pending = () => new Promise<never>(() => {});
  return { apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending) }, onSessionLost: vi.fn() };
});

// Every screen loads its own piece (#291), and after an update none of the old pieces is there
vi.mock('@/pages/home', () => gone());
vi.mock('@/pages/transactions', () => gone());
vi.mock('@/pages/analytics', () => gone());
vi.mock('@/pages/more', () => gone());
vi.mock('@/pages/categories', () => gone());
vi.mock('@/pages/pastel-showcase', () => gone());
vi.mock('@/pages/manual-entry', () => gone());
vi.mock('@/pages/capture-review', () => gone());
vi.mock('@/pages/capture-offline', () => gone());
vi.mock('@/pages/accounts', () => gone());
vi.mock('@/pages/audit', () => gone());
vi.mock('@/pages/login', () => gone());
vi.mock('@/pages/first-launch', () => gone());

const USER_ID = '900000143';
const TITLE = 'Экран не открылся';

let root: Root;
let container: HTMLDivElement;
let onboardedAt: string | null;
let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  ignoreWindowScroll();
  logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  onboardedAt = '2026-10-01T09:00:00.000Z';
  vi.mocked(apiClient.get).mockReset();
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url === '/settings') return { success: true, data: { onboardedAt } } as never;
    if (url === '/auth/web-login') return { success: true, data: { status: 'none' } } as never;
    return new Promise<never>(() => {});
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

const text = () => squash(document.body.textContent);
const title = () => squash(document.body.querySelector('h1')?.textContent);

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

describe('the pages’ code did not load', () => {
  it('Home shows «Экран не открылся» without the technical reason', async () => {
    await open('/');
    await until(() => title() === TITLE);

    expect(text()).not.toContain(FAILURE);
    expect(text()).not.toMatch(/Unexpected Application Error|\p{Extended_Pictographic}/u);
  });

  it('the login shows it too', async () => {
    useUserStore.setState({ userId: null, userType: null, telegramId: null, userName: null, signedOut: true });

    await open('/');
    await until(() => title() === TITLE);

    expect(text()).not.toContain(FAILURE);
  });

  it('the first launch shows it too', async () => {
    onboardedAt = null;

    await open('/');
    await until(() => title() === TITLE);

    expect(text()).not.toContain(FAILURE);
  });

  it('an unknown address still says «Такой страницы нет»', async () => {
    await open('/net-takoy-stranicy');
    await until(() => title() === 'Такой страницы нет');
  });
});
