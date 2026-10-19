import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { matchRoutes, MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HomePage } from '@/pages';
import { ROUTES } from '@/shared/lib/constants/routes';
import { useUserStore } from '@/entities/user';
import { accountKeys } from '@/entities/account';
import { transactionKeys } from '@/entities/transaction';
import { monthBounds, toLocalDate } from '@/shared/lib/dates';
import { RECENT_LIMIT } from '@/widgets/recent-transactions';
import { getMoreCaptureChannels } from '@/pages/more/model/moreCaptureChannels';
import { appRoutes } from './appRoutes';

/**
 * FT-113: manual entry is its own screen of «Пастель» at /add; the old form at /transactions/add and the
 * desktop «Быстрое добавление» sheet are gone. Home opens it in one tap and shows the «Записано» toast after.
 */

const USER_ID = '900000001';

/** The route that renders an address: the deepest match of the app's route table. */
function screenAt(path: string): string | undefined {
  return matchRoutes(appRoutes, path)?.at(-1)?.route.path;
}

function home(): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const month = monthBounds(toLocalDate(new Date()));
  client.setQueryData(accountKeys.list(USER_ID), { accounts: [], totalMinor: 0, rate: null, missingRate: false });
  client.setQueryData(transactionKeys.totals(USER_ID, month), {
    ...month, incomeMinor: 0, expenseMinor: 0, netMinor: 0, recordCount: 0,
    needsReview: { count: 0, totalMinor: 0 }, excludedMovementsMinor: 0,
    usd: { present: false, missingRate: false, rateMinor: null },
  });
  client.setQueryData(transactionKeys.recent(USER_ID, RECENT_LIMIT), []);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[ROUTES.HOME]}>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  useUserStore.setState({ userId: USER_ID, userType: 'telegram', telegramId: USER_ID, userName: 'Шукур' });
});

describe('routes', () => {
  it('/add is the manual entry screen', () => {
    expect(screenAt(ROUTES.MANUAL_ENTRY)).toBe('/add');
  });

  it('the old form at /transactions/add is gone', () => {
    expect(screenAt('/transactions/add')).toBe('*');
  });
});

describe('ways to manual entry', () => {
  it('Home opens it in one tap with the round keyboard button', () => {
    const link = [...home().matchAll(/<a [^>]*>/g)].map((match) => match[0]).find((tag) => tag.includes(`href="${ROUTES.MANUAL_ENTRY}"`));

    expect(link).toMatch(/aria-label="Ввести вручную"/);
    expect(link).toMatch(/rounded-pill/);
    expect(link).toMatch(/size-touch/);
  });

  it('the round button does not cut the input’s hint: it wraps', () => {
    const hint = [...home().matchAll(/<p [^>]*>[^<]*<\/p>/g)].map((match) => match[0]).find((tag) => tag.includes('Одной строкой, как боту'));

    expect(hint).toBeDefined();
    expect(hint).not.toMatch(/\btruncate\b/);
  });

  it('Home has no «Быстрое добавление» sheet any more', () => {
    expect(home()).not.toContain('Добавить транзакцию');
  });

  it('«Ещё» → «Вручную» opens it too', () => {
    const manual = getMoreCaptureChannels({ isGuest: false, hasBotLink: true }).find((channel) => channel.id === 'manual');

    expect(manual?.href).toBe(ROUTES.MANUAL_ENTRY);
  });
});

describe('after a save', () => {
  it('Home has the place where «Записано» with «Отменить» shows', () => {
    expect(home()).toMatch(/role="status" aria-live="polite"/);
  });
});
