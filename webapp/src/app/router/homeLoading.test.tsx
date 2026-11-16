import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { matchRoutes, MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ROUTES } from '@/shared/lib/constants/routes';
import { useUserStore } from '@/entities/user';
import { signInForStaticRender } from '@/entities/user/model/staticRenderUser';
import { settingsKeys } from '@/entities/settings';
import { appRoutes } from './appRoutes';
import { AuthGate } from './AuthGate';
import { FirstLaunchGate } from './FirstLaunchGate';

/**
 * FT-112: opening the mini app on Home shows Home's skeleton at every step before Home itself — while the
 * user and the settings decide about the first launch, while Home's code loads — never a spinner in the
 * middle. Rendered to static markup (no DOM): a static render reads the user store at its initial state,
 * so the gate is still waiting for the user.
 *
 * #290: every other screen opens on the theme's background and the Kapelka sign (`LoadingScreen`) at the same steps,
 * and while the login's or the first launch's code loads — no spinner and no «Загрузка».
 */

const SKELETON = /aria-busy="true"[^>]*>.*Загружаю ваши счета и записи/;
const LOADING_SCREEN = /<p role="status" class="sr-only">Открываю Kapelka<\/p><div aria-busy="true"[^>]*>.*kapelka/;
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const spinner = (html: string) => /animate-spin/.test(html) || /Загрузка/.test(text(html));

const USER_ID = '900000290';
let restore: (() => void) | null = null;

afterEach(() => {
  restore?.();
  restore = null;
});

function renderAt(path: string, element: ReactNode, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('opening Home', () => {
  it('while the gate waits to know about the first launch, Home is already its skeleton', () => {
    const html = renderAt(ROUTES.HOME, <FirstLaunchGate />);

    expect(html).toMatch(SKELETON);
    expect(spinner(html)).toBe(false);
  });

  it('while Home’s code loads, the same skeleton stands', () => {
    const home = matchRoutes(appRoutes, ROUTES.HOME)?.at(-1)?.route;
    expect(home?.path).toBe(ROUTES.HOME);

    const html = renderAt(ROUTES.HOME, home?.element);

    expect(html).toMatch(SKELETON);
    expect(spinner(html)).toBe(false);
  });

  it('another screen does not open on Home’s skeleton: its layout would jump', () => {
    expect(renderAt(ROUTES.TRANSACTIONS, <FirstLaunchGate />)).not.toMatch(SKELETON);
  });
});

describe('opening another screen (#290)', () => {
  // The links of the bot («Открыть аналитику ↗», «Открыть цели ↗») open these straight away
  const SCREENS = [ROUTES.TRANSACTIONS, ROUTES.ANALYTICS, ROUTES.MORE, ROUTES.ACCOUNTS, ROUTES.AUDIT];

  it.each(SCREENS)('%s: while the app learns who is signed in, the background and the sign stand', (path) => {
    const html = renderAt(path, <AuthGate />);

    expect(html).toMatch(LOADING_SCREEN);
    expect(spinner(html)).toBe(false);
  });

  it.each(SCREENS)('%s: while the gate waits to know about the first launch, the same', (path) => {
    const html = renderAt(path, <FirstLaunchGate />);

    expect(html).toMatch(LOADING_SCREEN);
    expect(spinner(html)).toBe(false);
  });

  it.each(SCREENS)('%s: while the screen’s code loads, the same', (path) => {
    const screen = matchRoutes(appRoutes, path)?.at(-1)?.route;
    expect(screen?.path).toBe(path);

    const html = renderAt(path, screen?.element);

    expect(html).toMatch(LOADING_SCREEN);
    expect(spinner(html)).toBe(false);
  });

  it('while the login screen’s code loads, the same', () => {
    const initial = useUserStore.getInitialState();
    const before = initial.signedOut;
    Object.assign(initial, { signedOut: true });
    restore = () => Object.assign(initial, { signedOut: before });

    const html = renderAt(ROUTES.ANALYTICS, <AuthGate />);

    expect(html).toMatch(LOADING_SCREEN);
    expect(spinner(html)).toBe(false);
  });

  it('while the first launch’s code loads, the same', () => {
    restore = signInForStaticRender({ userId: USER_ID });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(settingsKeys.detail(USER_ID), { onboardedAt: null });

    const html = renderAt(ROUTES.ANALYTICS, <FirstLaunchGate />, client);

    expect(html).toMatch(LOADING_SCREEN);
    expect(spinner(html)).toBe(false);
  });
});
