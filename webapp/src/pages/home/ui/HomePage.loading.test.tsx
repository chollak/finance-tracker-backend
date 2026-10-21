import { afterEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { accountKeys } from '@/entities/account';
import { auditKeys } from '@/entities/audit';
import { BOARD_GOALS, BOARD_OPEN } from '@/entities/audit/model/fixtures';
import { categoryKeys } from '@/entities/category';
import { rateKeys } from '@/entities/rate';
import { transactionKeys } from '@/entities/transaction';
import { signInForStaticRender } from '@/entities/user/model/staticRenderUser';
import { monthBounds, toLocalDate } from '@/shared/lib/dates';
import { RECENT_LIMIT } from '@/widgets/recent-transactions';
import { HomePage } from './HomePage';

/**
 * FT-112 review: HomePage is its skeleton until its first reads (the balances, the month's totals, the
 * recent records, the categories, since FT-137 the USD rate of «Сум / USD», and since FT-132 the audit and its goals of the
 * card under the tiles) have answered once, and then stays Home — also while a read that failed
 * is asked again by the sections that show its error. Rendered to static markup for a signed-in user; a read
 * is put in the state it would be in when HomePage renders.
 */

const USER_ID = '900000001';
const month = monthBounds(toLocalDate(new Date()));

type Read = 'accounts' | 'totals' | 'records' | 'categories' | 'rate' | 'audit' | 'goals';
const READS: Read[] = ['accounts', 'totals', 'records', 'categories', 'rate', 'audit', 'goals'];
const KEYS: Record<Read, readonly unknown[]> = {
  accounts: accountKeys.list(USER_ID),
  totals: transactionKeys.totals(USER_ID, month),
  records: transactionKeys.recent(USER_ID, RECENT_LIMIT),
  categories: categoryKeys.list(USER_ID),
  rate: rateKeys.usd(USER_ID),
  audit: auditKeys.current(USER_ID),
  goals: auditKeys.goals(USER_ID),
};
const ANSWERS: Record<Read, unknown> = {
  accounts: { accounts: [], totalMinor: 0, rate: null, missingRate: false },
  totals: {
    ...month,
    incomeMinor: 0,
    expenseMinor: 0,
    netMinor: 0,
    recordCount: 0,
    needsReview: { count: 0, totalMinor: 0 },
    excludedMovementsMinor: 0,
    usd: { present: false, missingRate: false, rateMinor: null },
  },
  records: [],
  categories: [],
  rate: { effective: null, cbu: null, own: null },
  audit: BOARD_OPEN,
  goals: BOARD_GOALS,
};

/** A client whose reads have answered, except the ones still on their way and the ones that failed. */
async function client({ onTheirWay = [], failed = [] }: { onTheirWay?: Read[]; failed?: Read[] } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const read of Object.keys(KEYS) as Read[]) {
    if (onTheirWay.includes(read)) continue;
    if (failed.includes(read)) {
      await queryClient.prefetchQuery({ queryKey: KEYS[read], queryFn: () => Promise.reject(new Error('500')) });
    } else {
      queryClient.setQueryData(KEYS[read], ANSWERS[read]);
    }
  }
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

const SKELETON = 'Загружаю ваши счета и записи';
const isSkeleton = (html: string) => html.includes(SKELETON);
const isHome = (html: string) => html.includes('Всего на счетах') && html.includes('Последние операции');

let signOut = () => {};
afterEach(() => signOut());

describe('HomePage of a signed-in user', () => {
  it('is its skeleton while its reads are on their way', async () => {
    signOut = signInForStaticRender({ userId: USER_ID });

    const html = render(await client({ onTheirWay: READS }));

    expect(isSkeleton(html)).toBe(true);
    expect(isHome(html)).toBe(false);
  });

  it.each<Read>(READS)('waits for each of them: %s', async (read) => {
    signOut = signInForStaticRender({ userId: USER_ID });

    expect(isSkeleton(render(await client({ onTheirWay: [read] })))).toBe(true);
  });

  it('is Home once they have answered', async () => {
    signOut = signInForStaticRender({ userId: USER_ID });

    const html = render(await client());

    expect(isSkeleton(html)).toBe(false);
    expect(isHome(html)).toBe(true);
  });

  it('shows the invitation to the audit under the month tiles, over the recent records (FT-132)', async () => {
    signOut = signInForStaticRender({ userId: USER_ID });

    const html = render(await client());

    expect(html.indexOf('Ревизия сентября')).toBeGreaterThan(html.indexOf('Расход за'));
    expect(html.indexOf('Ревизия сентября')).toBeLessThan(html.indexOf('Последние операции'));
  });

  it.each<Read>(READS)(
    'stays Home when %s failed before it had data, while its section asks it again on mount',
    async (read) => {
      signOut = signInForStaticRender({ userId: USER_ID });

      const html = render(await client({ failed: [read] }));

      expect(isSkeleton(html)).toBe(false);
      expect(isHome(html)).toBe(true);
    }
  );
});
