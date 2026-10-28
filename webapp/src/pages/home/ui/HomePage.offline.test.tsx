import { afterEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { accountKeys } from '@/entities/account';
import { categoryKeys } from '@/entities/category';
import { rateKeys } from '@/entities/rate';
import { transactionKeys } from '@/entities/transaction';
import { signInForStaticRender } from '@/entities/user/model/staticRenderUser';
import { monthBounds, toLocalDate } from '@/shared/lib/dates';
import { useConnectivityStore } from '@/shared/lib/offline';
import { RECENT_LIMIT } from '@/widgets/recent-transactions';
import { HomePage } from './HomePage';

/**
 * FT-129, boards «Главная без связи», «Главная без связи · тёмная» and OfflineBar.md: without a connection Home says so
 * in one line under its header — «Нет связи — записи сохранятся и отправятся сами» — and opens on what it has instead
 * of waiting for reads that cannot come. Rendered to static markup for a signed-in user; a static render reads a store's
 * initial state, so the connection is put there.
 */

const USER_ID = '900000001';
const month = monthBounds(toLocalDate(new Date()));
const BAR = 'Нет связи — записи сохранятся и отправятся сами';

function answered(): QueryClient {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(accountKeys.list(USER_ID), { accounts: [], totalMinor: 0, rate: null, missingRate: false });
  queryClient.setQueryData(transactionKeys.totals(USER_ID, month), {
    ...month,
    incomeMinor: 0,
    expenseMinor: 0,
    netMinor: 0,
    recordCount: 0,
    needsReview: { count: 0, totalMinor: 0 },
    excludedMovementsMinor: 0,
    usd: { present: false, missingRate: false, rateMinor: null },
  });
  queryClient.setQueryData(transactionKeys.recent(USER_ID, RECENT_LIMIT), []);
  queryClient.setQueryData(categoryKeys.list(USER_ID), []);
  queryClient.setQueryData(rateKeys.usd(USER_ID), { effective: null, cbu: null, own: null });
  return queryClient;
}

function render(queryClient: QueryClient): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function offlineForStaticRender(): () => void {
  const initial = useConnectivityStore.getInitialState();
  const before = { ...initial };
  Object.assign(initial, { browserOnline: false, lost: false });
  return () => Object.assign(initial, before);
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe('Home without a connection', () => {
  it('says so in one status line under the header', () => {
    cleanups.push(signInForStaticRender({ userId: USER_ID }), offlineForStaticRender());

    const html = render(answered());

    expect(html).toMatch(new RegExp(`<div[^>]*role="status"[^>]*>.*${BAR}`));
    // Under the header, over the balance card
    expect(html.indexOf(BAR)).toBeGreaterThan(html.indexOf('kapelka'));
    expect(html.indexOf(BAR)).toBeLessThan(html.indexOf('Всего на счетах'));
  });

  it('opens at once instead of waiting for reads that cannot come', () => {
    cleanups.push(signInForStaticRender({ userId: USER_ID }), offlineForStaticRender());

    const html = render(new QueryClient());

    expect(html).not.toContain('Загружаю ваши счета и записи');
    expect(html).toContain(BAR);
    expect(html).toContain('Последние операции');
  });

  it('online there is no such line', () => {
    cleanups.push(signInForStaticRender({ userId: USER_ID }));

    expect(render(answered())).not.toContain(BAR);
  });
});
