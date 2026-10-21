import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { matchRoutes, MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ROUTES } from '@/shared/lib/constants/routes';
import { appRoutes } from './appRoutes';
import { FirstLaunchGate } from './FirstLaunchGate';

/**
 * FT-112: opening the mini app on Home shows Home's skeleton at every step before Home itself — while the
 * user and the settings decide about the first launch, while Home's code loads — never a spinner in the
 * middle. Rendered to static markup (no DOM): a static render reads the user store at its initial state,
 * so the gate is still waiting for the user.
 */

const SKELETON = /aria-busy="true"[^>]*>.*Загружаю ваши счета и записи/;
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const spinner = (html: string) => /animate-spin/.test(html) || text(html).includes('Загрузка...');

function renderAt(path: string, element: ReactNode): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
