// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { useUserStore } from '@/entities/user';
import { reloadHere, reloadHome } from '@/pages/route-error/model/reload';
import { apiClient } from '@/shared/api';
import { appRoutes } from './appRoutes';

/**
 * #240, boards «Что-то пошло не так» and «Что-то пошло не так · тёмная»: a screen that falls while drawing shows
 * «Экран не открылся» in its place — the router's error page, not the old one with an emoji and a shadcn button. The
 * failure goes to the log, never onto the screen. A 404 is still «Такой страницы нет».
 */

const FAILURE = "Cannot read properties of undefined (reading 'amountMinor')";

vi.mock('@/shared/api/client', () => {
  const pending = () => new Promise<never>(() => {});
  return { apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending) }, onSessionLost: vi.fn() };
});

// Home and Analytics fall while drawing; the other pages are the app's own
vi.mock('@/pages', async (importOriginal) => {
  const pages = await importOriginal<typeof import('@/pages')>();
  const fall = (): never => {
    throw new TypeError("Cannot read properties of undefined (reading 'amountMinor')");
  };
  return { ...pages, HomePage: fall, AnalyticsPage: fall };
});

vi.mock('@/pages/route-error/model/reload', () => ({ reloadHere: vi.fn(), reloadHome: vi.fn() }));

const USER_ID = '900000143';
const TITLE = 'Экран не открылся';

let root: Root;
let container: HTMLDivElement;
let logged: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  await import('@/pages');
}, 60_000);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(reloadHere).mockReset();
  vi.mocked(reloadHome).mockReset();
  vi.mocked(apiClient.get).mockReset();
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url === '/settings') return { success: true, data: { onboardedAt: '2026-10-01T09:00:00.000Z' } } as never;
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

const squash = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() ?? '';
const text = () => squash(document.body.textContent);
const title = () => squash(document.body.querySelector('h1')?.textContent);

async function wait(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

/** Waits (up to `timeout`) for the screen to show something; the gates and lazy pages take a few renders. */
async function until(predicate: () => boolean, timeout = 4000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error(`Timed out; the screen says: ${text().slice(0, 300)}`);
    await wait(20);
  }
}

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

function button(name: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll('button')].find((candidate) => squash(candidate.textContent) === name);
  if (!found) throw new Error(`No button «${name}»; the screen says: ${text().slice(0, 300)}`);
  return found;
}

describe('a screen that falls while drawing', () => {
  it('Home shows «Экран не открылся» in its place, with «Обновить» and «На главную»', async () => {
    await open('/');
    await until(() => title() === TITLE);

    expect(document.body.querySelectorAll('h1')).toHaveLength(1);
    expect([...document.body.querySelectorAll('button')].map((candidate) => squash(candidate.textContent))).toEqual([
      'Обновить',
      'На главную',
    ]);
  });

  it('any other screen shows it too', async () => {
    await open('/analytics');
    await until(() => title() === TITLE);
  });

  it('keeps the failure off the screen and puts it in the log', async () => {
    await open('/');
    await until(() => title() === TITLE);

    expect(text()).not.toContain(FAILURE);
    expect(text()).not.toMatch(/TypeError|Unexpected Application Error|\p{Extended_Pictographic}/u);
    const failures = logged.mock.calls.flat().filter((argument: unknown) => argument instanceof Error);
    expect(failures.map((failure: Error) => failure.message)).toContain(FAILURE);
  });

  it('«Обновить» loads the app again at this address, «На главную» on Home', async () => {
    await open('/');
    await until(() => title() === TITLE);

    await act(async () => button('Обновить').click());
    expect(reloadHere).toHaveBeenCalledTimes(1);

    await act(async () => button('На главную').click());
    expect(reloadHome).toHaveBeenCalledTimes(1);
  });
});

describe('an unknown address', () => {
  it('still says «Такой страницы нет»', async () => {
    await open('/net-takoy-stranicy');
    await until(() => title() === 'Такой страницы нет');

    expect(text()).not.toContain(TITLE);
  });
});
