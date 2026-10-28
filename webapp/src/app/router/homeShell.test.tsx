import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HomePage, MorePage } from '@/pages';
import { FormPageHeader, PageHeader } from '@/shared/ui';
import { ROUTES } from '@/shared/lib/constants/routes';
import { useUserStore } from '@/entities/user';
import { transactionKeys } from '@/entities/transaction';
import { accountKeys } from '@/entities/account';
import { monthBounds, toLocalDate } from '@/shared/lib/dates';
import { RECENT_LIMIT } from '@/widgets/recent-transactions';
import type { Transaction } from '@/shared/types';
import { AppShell } from './AppShell';

/**
 * FT-110: Home is the shell of the app. There is no bottom bar: History and Analytics open from Home,
 * everything else from «Ещё», and nested screens get Telegram's BackButton or their own «Назад».
 * Rendered to static markup (no DOM): what a screen offers to press is in its links and buttons.
 */

const USER_ID = '900000001';

type HomeState = 'loading' | 'empty' | 'with-records';

function record(id: string, amount: number): Transaction {
  return {
    id,
    date: new Date().toISOString().slice(0, 10),
    category: 'Кафе',
    description: 'Обед',
    amount,
    amountMinor: amount * 100,
    type: 'expense',
    userId: USER_ID,
  };
}

/** What Home reads since FT-111: the accounts, the month's totals and the recent records. */
function queryClient(state: HomeState): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (state === 'loading') return client;
  const records = state === 'with-records' ? [record('t1', 45000), record('t2', 18000)] : [];
  const month = monthBounds(toLocalDate(new Date()));
  client.setQueryData(accountKeys.list(USER_ID), { accounts: [], totalMinor: 0, rate: null, missingRate: false });
  client.setQueryData(transactionKeys.totals(USER_ID, month), {
    ...month,
    incomeMinor: 0,
    expenseMinor: records.reduce((sum, item) => sum + (item.amountMinor ?? 0), 0),
    netMinor: 0,
    recordCount: records.length,
    needsReview: { count: 0, totalMinor: 0 },
    excludedMovementsMinor: 0,
    usd: { present: false, missingRate: false, rateMinor: null },
  });
  client.setQueryData(transactionKeys.recent(USER_ID, RECENT_LIMIT), records);
  return client;
}

function render(element: ReactElement, path: string, state: HomeState = 'loading'): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient(state)}>
      <MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>
    </QueryClientProvider>
  );
}

/** Where each link of a screen goes (in-app addresses only). */
function linkTargets(html: string): string[] {
  return [...html.matchAll(/<a [^>]*href="(\/[^"]*)"/g)].map((match) => match[1]);
}

function anchorTo(html: string, href: string): string | undefined {
  return [...html.matchAll(/<a [^>]*>/g)].map((match) => match[0]).find((tag) => tag.includes(`href="${href}"`));
}

const BACK_BUTTON = /<button[^>]*aria-label="Назад"/;

function telegramWebApp() {
  return {
    initData: 'query_id=1&hash=abc',
    version: '8.0',
    isVersionAtLeast: () => true,
    BackButton: { show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn() },
  };
}

beforeEach(() => {
  useUserStore.setState({ userId: USER_ID, userType: 'telegram', telegramId: USER_ID, userName: 'Шукур' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Home header', () => {
  it('shows the kapelka sign and a round «Ещё» that opens «Ещё»', () => {
    const html = render(<HomePage />, ROUTES.HOME);

    expect(html).toContain('kapelka');
    const more = anchorTo(html, ROUTES.MORE);
    expect(more).toBeDefined();
    expect(more).toMatch(/aria-label="Ещё/);
    // 48px circle (`key` size token, pill radius)
    expect(more).toMatch(/size-key/);
    expect(more).toMatch(/rounded-pill/);
  });

  it('has no «Назад»: Home is the top of the app', () => {
    expect(render(<HomePage />, ROUTES.HOME, 'with-records')).not.toMatch(BACK_BUTTON);
  });

  it('has the composer at the bottom in place of the text capture card (FT-114)', () => {
    const html = render(<HomePage />, ROUTES.HOME);

    expect(html).toMatch(/role="region" aria-label="Быстрый ввод"/);
    expect(html).not.toContain('Запишите одной строкой');
  });
});

describe('Home opens History and Analytics in one tap', () => {
  // While loading Home is its skeleton (FT-112): nothing to press until the data comes
  it.each<HomeState>(['empty', 'with-records'])('while %s', (state) => {
    const targets = linkTargets(render(<HomePage />, ROUTES.HOME, state));

    expect(targets).toContain(ROUTES.TRANSACTIONS);
    expect(targets).toContain(ROUTES.ANALYTICS);
    expect(targets).toContain(ROUTES.MORE);
  });
});

describe('every section is at most 2 taps from Home', () => {
  const SECTIONS = [ROUTES.TRANSACTIONS, ROUTES.ANALYTICS, ROUTES.MORE, ROUTES.ACCOUNTS, ROUTES.MANUAL_ENTRY, ROUTES.CATEGORIES];
  /** Screens whose own links count as the second tap. */
  const SCREENS: Record<string, () => ReactElement> = { [ROUTES.MORE]: () => <MorePage /> };

  function reachable(state: HomeState): Set<string> {
    const firstTap = new Set(linkTargets(render(<HomePage />, ROUTES.HOME, state)));
    const taps = new Set(firstTap);
    for (const target of firstTap) {
      const screen = SCREENS[target];
      if (screen) linkTargets(render(screen(), target, state)).forEach((href) => taps.add(href));
    }
    return taps;
  }

  it.each<HomeState>(['empty', 'with-records'])('while %s', (state) => {
    const taps = reachable(state);

    expect(SECTIONS.filter((section) => !taps.has(section))).toEqual([]);
  });

  // Д2, FT-125: budgets and debts leave the navigation; their code and data stay
  it.each<HomeState>(['empty', 'with-records'])('budgets and debts are not offered, while %s', (state) => {
    const taps = [...reachable(state)];

    expect(taps.filter((href) => href.startsWith(ROUTES.BUDGETS) || href.startsWith(ROUTES.DEBTS))).toEqual([]);
  });
});

describe('no bottom bar', () => {
  it('the app shell around Home draws no navigation bar', () => {
    const router = createMemoryRouter(
      [{ element: <AppShell />, children: [{ path: ROUTES.HOME, element: <HomePage /> }] }],
      { initialEntries: [ROUTES.HOME] }
    );
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient('with-records')}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );

    expect(html).toContain('kapelka');
    expect(html).not.toMatch(/<nav[\s>]/);
  });
});

describe('«Назад» on nested screens', () => {
  it('outside Telegram a nested screen draws its own «Назад»', () => {
    expect(render(<MorePage />, ROUTES.MORE)).toMatch(BACK_BUTTON);
    expect(render(<PageHeader title="История" />, ROUTES.TRANSACTIONS)).toMatch(BACK_BUTTON);
    expect(render(<FormPageHeader title="Новый бюджет" />, ROUTES.ADD_BUDGET)).toMatch(BACK_BUTTON);
  });

  it('a plain browser with the Telegram SDK loaded is still outside Telegram', () => {
    vi.stubGlobal('window', { Telegram: { WebApp: { ...telegramWebApp(), initData: '' } } });

    expect(render(<PageHeader title="История" />, ROUTES.TRANSACTIONS)).toMatch(BACK_BUTTON);
  });

  it('inside Telegram the screen leaves «Назад» to Telegram’s BackButton', () => {
    vi.stubGlobal('window', { Telegram: { WebApp: telegramWebApp() } });

    expect(render(<PageHeader title="История" />, ROUTES.TRANSACTIONS)).not.toMatch(BACK_BUTTON);
    expect(render(<FormPageHeader title="Новый бюджет" />, ROUTES.ADD_BUDGET)).not.toMatch(BACK_BUTTON);
  });
});
