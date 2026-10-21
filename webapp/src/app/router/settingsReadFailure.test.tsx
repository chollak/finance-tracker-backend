// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { useUserStore } from '@/entities/user';
import { apiClient } from '@/shared/api';
import { ROUTES } from '@/shared/lib/constants/routes';
import { appRoutes } from './appRoutes';

/**
 * FT-125 review: when the settings cannot be read, the first-launch gate lets the app through (FT-109). A screen that
 * reads the settings itself then asks for them again as it mounts, and while that answer is on its way the failed
 * read has no data — it must not send the app back to the gate's spinner. Before the fix «Ещё» and Home went from the
 * spinner to the screen and back about twice a second, asking for the settings each time, and «Ещё»'s «Не
 * загрузилось» row never showed. Rendered in jsdom with the whole route table; every read the test does not answer
 * fails.
 */

vi.mock('@/shared/api/client', () => {
  const pending = () => new Promise<never>(() => {});
  return { apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending) } };
});

const USER_ID = '900000001';
const serverError = () => Object.assign(new Error('Internal Server Error'), { status: 500 });

let root: Root;
let container: HTMLDivElement;

// The screens are lazy: load their code once here, so a slow first import (a busy test run) is not mistaken for the
// gate's spinner
beforeAll(async () => {
  await import('@/pages');
}, 60_000);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.mocked(apiClient.get).mockReset();
  // A failure that takes a moment, as over the network: until it comes the read is pending again
  vi.mocked(apiClient.get).mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    throw serverError();
  });
  useUserStore.setState({ userId: USER_ID, userType: 'telegram', telegramId: USER_ID, userName: 'Шукур' });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const settingsReads = () => vi.mocked(apiClient.get).mock.calls.filter(([url]) => url === '/settings').length;
const squash = (value: string | null | undefined) => value?.replace(/[ \t\n\r]+/g, ' ').trim() ?? '';
const text = () => squash(document.body.textContent);

async function wait(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

/** Waits (up to `timeout`) for the screen to show something; the lazy pages load on the first render. */
async function until(predicate: () => boolean, timeout = 5000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error(`Timed out; the screen says: ${text().slice(0, 300)}`);
    await wait(20);
  }
}

/** From now on, whether the element ever left the page — the screen swapped for the gate's spinner or skeleton. */
function watchStays(selector: string): () => boolean {
  let left = false;
  const observer = new MutationObserver(() => {
    if (!document.body.querySelector(selector)) left = true;
  });
  observer.observe(document.body, { childList: true, subtree: true });
  watchers.push(observer);
  return () => left;
}

const watchers: MutationObserver[] = [];
afterEach(() => watchers.splice(0).forEach((observer) => observer.disconnect()));

async function openAt(path: string) {
  // The app's own retry is 1; without it the loop is the same, only faster
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );
  });
}

const RETRY = 'Не загрузилось. Нажмите, чтобы повторить';

describe('the settings cannot be read', () => {
  it('«Ещё» opens and stays, its bot rows say so and read them again on a tap', async () => {
    await openAt(ROUTES.MORE);

    await until(() => text().includes(RETRY));
    const left = watchStays('[data-settings-row]');
    await wait(300);
    // The gate's read and «Ещё»'s own one as it mounted — not one per half a second
    expect(settingsReads()).toBeLessThanOrEqual(2);
    expect(document.body.querySelector('h1')?.textContent).toBe('Ещё');
    expect(text()).not.toContain('Загрузка...');

    const reads = settingsReads();
    const summary = [...document.body.querySelectorAll<HTMLElement>('[data-settings-row]')].find((row) => row.textContent?.includes('Сводка дня'));
    await act(async () => summary?.click());
    await wait(300);

    expect(settingsReads()).toBe(reads + 1);
    expect(text()).toContain(RETRY);
    // Asked again, the screen never went back to the spinner
    expect(left()).toBe(false);
  }, 15_000);

  it('Home opens with its sections and does not go back to the skeleton', async () => {
    await openAt(ROUTES.HOME);

    // The composer reads the settings itself (its chips): Home is past its skeleton
    await until(() => document.body.querySelector('[aria-label="Быстрый ввод"]') !== null);
    const left = watchStays('[aria-label="Быстрый ввод"]');
    await wait(300);

    expect(settingsReads()).toBeLessThanOrEqual(2);
    expect(left()).toBe(false);
    expect(document.body.querySelector('[aria-busy="true"]')).toBeNull();
  }, 15_000);
});
