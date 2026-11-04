// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, matchRoutes, RouterProvider } from 'react-router-dom';
import { useUserStore } from '@/entities/user';
import { apiClient } from '@/shared/api';
import { ROUTES } from '@/shared/lib/constants/routes';
import { appRoutes } from './appRoutes';

/**
 * #222, boards «Страница не найдена» and «Страница не найдена · тёмная»: any unknown address of the app shows
 * ProblemScreen in its `centered` view with the Kapelka sign in the header — a broken link, «Такой страницы нет», where
 * the records are, and «На главную». No emoji. The gates stay in front of it: a browser without a session sees the
 * login, a user before the first launch the first launch.
 */

vi.mock('@/shared/api/client', () => {
  const pending = () => new Promise<never>(() => {});
  return { apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending) }, onSessionLost: vi.fn() };
});

const USER_ID = '900000143';
const UNKNOWN = '/net-takoy-stranicy';
const TITLE = 'Такой страницы нет';
const TEXT = 'Ссылка устарела или в ней опечатка. Записи на месте — они на главной.';

let root: Root;
let container: HTMLDivElement;
let onboardedAt: string | null;

beforeAll(async () => {
  await import('@/pages');
}, 60_000);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

describe('an unknown address', () => {
  it('is the catch-all route of the app', () => {
    expect(matchRoutes(appRoutes, UNKNOWN)?.at(-1)?.route.path).toBe('*');
  });

  it('says the page is not there and where the records are, under the Kapelka sign, with «На главную»', async () => {
    await open(UNKNOWN);
    await until(() => title() === TITLE);

    expect(document.body.querySelectorAll('h1')).toHaveLength(1);
    expect(squash(document.body.querySelector('h1 + p')?.textContent)).toBe(TEXT);
    expect(text()).toContain('kapelka');
    expect([...document.body.querySelectorAll('button')].map((candidate) => squash(candidate.textContent))).toEqual(['На главную']);
  });

  it('has no emoji', async () => {
    await open(UNKNOWN);
    await until(() => title() === TITLE);

    expect(text()).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('draws the broken link as a line icon in the text colour', async () => {
    await open(UNKNOWN);
    await until(() => title() === TITLE);

    const icon = document.body.querySelector('h1')?.previousElementSibling;
    const line = icon?.querySelector('svg path');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(line?.getAttribute('stroke')).toBe('currentColor');
    expect(line?.getAttribute('stroke-width')).toBe('1.8');
  });

  it('«На главную» opens Home in its place', async () => {
    const router = await open(UNKNOWN);
    await until(() => title() === TITLE);

    await act(async () => button('На главную').click());

    expect(router.state.location.pathname).toBe(ROUTES.HOME);
    expect(router.state.historyAction).toBe('REPLACE');
  });
});

describe('the gates stay in front of it', () => {
  it('a browser without a session sees the login at an unknown address', async () => {
    useUserStore.setState({ userId: null, userType: null, telegramId: null, userName: null, signedOut: true });

    const router = await open(UNKNOWN);
    await until(() => title() !== '');

    expect(title()).not.toBe(TITLE);
    expect(text()).toContain('Войти через Telegram');
    expect(router.state.location.pathname).toBe(UNKNOWN);
  });

  it('before the first launch the first launch comes first', async () => {
    onboardedAt = null;

    await open(UNKNOWN);
    await until(() => title() !== '');

    expect(title()).toBe('Сколько у вас сейчас денег?');
  });
});
