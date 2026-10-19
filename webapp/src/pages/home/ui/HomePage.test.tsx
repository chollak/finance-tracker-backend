import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Account, AccountsOverview } from '@/entities/account';
import type { PeriodTotals } from '@/entities/transaction';
import type { Category } from '@/entities/category';
import { addDays, monthBounds, monthNameIn, monthNameLower, toLocalDate } from '@/shared/lib/dates';
import { MINUS, NBSP } from '@/shared/lib/money';
import { ROUTES } from '@/shared/lib/constants/routes';
import type { Transaction } from '@/shared/types';
import { BalanceCardView } from '@/widgets/balance-card/ui/BalanceCard';
import { SummaryTilesView } from '@/widgets/summary-tiles/ui/SummaryTiles';
import { FIRST_RECORD_HINT, RecentRecordsView } from '@/widgets/recent-transactions/ui/RecentTransactions';
import { HomePage } from './HomePage';

/**
 * FT-111, boards «Главная» and «Главная после первого запуска»: the balance card, the month tiles and the
 * recent records by day, from GET /api/accounts, GET /api/transactions/totals and the history API.
 * Rendered to static markup (no DOM). A static render reads stores at their initial state, so the screen
 * itself renders as it does before its data arrives; the sections are rendered from given data.
 */

const USER_ID = '900000001';
const TODAY = toLocalDate(new Date());
const MONTH = Number(TODAY.slice(5, 7));

function account(overrides: Partial<Account>): Account {
  return {
    id: 'card',
    name: 'Карта',
    kind: 'card',
    currency: 'UZS',
    openingBalanceMinor: 0,
    openingDate: TODAY,
    isHidden: false,
    sortOrder: 10,
    balanceMinor: 0,
    ...overrides,
  };
}

const ACCOUNTS: AccountsOverview = {
  accounts: [
    account({ id: 'cash', name: 'Наличные', kind: 'cash', balanceMinor: 125_000_000, openingBalanceMinor: 125_000_000 }),
    account({ id: 'card', name: 'Карта', balanceMinor: 318_000_000, openingBalanceMinor: 318_000_000 }),
    account({ id: 'usd', name: 'Доллары', kind: 'cash', currency: 'USD', balanceMinor: 42_000, openingBalanceMinor: 42_000 }),
  ],
  totalMinor: 974_300_000,
  rate: { rateMinor: 1_265_000, source: 'cbu', date: TODAY },
  missingRate: false,
};

function totals(incomeMinor: number, expenseMinor: number): PeriodTotals {
  return {
    ...monthBounds(TODAY),
    incomeMinor,
    expenseMinor,
    netMinor: incomeMinor - expenseMinor,
    recordCount: 0,
    needsReview: { count: 0, totalMinor: 0 },
    excludedMovementsMinor: 0,
    usd: { present: false, missingRate: false, rateMinor: null },
  };
}

const CATEGORIES: Category[] = [
  { id: 'pr', type: 'expense', name: 'Продукты', color: 'peach', isHidden: false, isOther: false, sortOrder: 10, presetKey: 'groceries' },
  { id: 'zp', type: 'income', name: 'Зарплата', color: 'mint', isHidden: false, isOther: false, sortOrder: 10, presetKey: 'salary' },
];

function record(overrides: Partial<Transaction>): Transaction {
  return { id: 'r', date: TODAY, category: 'Другое', description: '', amount: 0, type: 'expense', userId: USER_ID, ...overrides };
}

const RECORDS: Transaction[] = [
  record({ id: 't1', categoryId: 'pr', amountMinor: 18_640_000, description: 'Супермаркет' }),
  record({ id: 't3', categoryId: 'zp', type: 'income', amountMinor: 1_250_000_000, date: addDays(TODAY, -1), description: 'За сентябрь' }),
];

interface View {
  accounts?: AccountsOverview;
  totals?: PeriodTotals;
  records?: Transaction[];
  expanded?: boolean;
}

function markup(element: ReactElement): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[ROUTES.HOME]}>{element}</MemoryRouter>
    </QueryClientProvider>
  );
}

/** The three sections of Home as the boards stack them, from the given data. */
function home({ accounts, totals: monthTotals, records, expanded = false }: View): string {
  const query = <T,>(data: T | undefined) => ({ data, isError: false });
  return markup(
    <>
      <BalanceCardView accounts={query(accounts)} totals={query(monthTotals)} month={MONTH} expanded={expanded} onToggle={() => {}} />
      <SummaryTilesView totals={query(monthTotals)} year={Number(TODAY.slice(0, 4))} month={MONTH} />
      <RecentRecordsView records={query(records)} categories={CATEGORIES} today={TODAY} onOpen={() => {}} />
    </>
  );
}

// Collapses markup and ordinary spaces; keeps the non-breaking ones money is grouped with
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[ \t\n\r]+/g, ' ');
const anchors = (html: string) => [...html.matchAll(/<a [^>]*>/g)].map((match) => match[0]);

describe('balance card', () => {
  const board = () => home({ accounts: ACCOUNTS, totals: totals(1_629_500_000, 768_440_000), records: RECORDS });

  it('heads Home with the total of GET /api/accounts in сум', () => {
    const html = board();

    expect(html).toMatch(/<h1[^>]*>Всего на счетах<\/h1>/);
    expect(text(html)).toContain(`9${NBSP}743${NBSP}000 сум`);
  });

  it('opens the accounts from «3 счёта», closed at first', () => {
    expect(board()).toMatch(/<button[^>]*aria-expanded="false"[^>]*>.*?3 счёта/);
  });

  it('says what share of this month’s income is spent', () => {
    expect(text(board())).toContain(`В ${monthNameIn(MONTH)} потрачено 47% дохода`);
  });

  it('lists the accounts in their own currencies and links to «Все счета и курс доллара» when open', () => {
    const html = home({ accounts: ACCOUNTS, totals: totals(0, 0), expanded: true });

    expect(html).toMatch(/aria-expanded="true"/);
    expect(text(html)).toContain(`Наличные 1${NBSP}250${NBSP}000${NBSP}сум`);
    expect(text(html)).toContain(`Доллары 420,00${NBSP}USD`);
    expect(anchors(html).find((tag) => tag.includes(`href="${ROUTES.ACCOUNTS}"`))).toBeDefined();
    expect(text(html)).toContain('Все счета и курс доллара');
  });
});

describe('month tiles', () => {
  it('show income and expenses of the month from the totals service; both open Analytics', () => {
    const html = home({ accounts: ACCOUNTS, totals: totals(1_629_500_000, 768_440_000), records: RECORDS });
    const month = monthNameLower(MONTH);

    expect(text(html)).toContain(`Доход за ${month} +16${NBSP}295${NBSP}000`);
    expect(text(html)).toContain(`Расход за ${month} ${MINUS}7${NBSP}684${NBSP}400`);
    const tiles = anchors(html).filter((tag) => tag.includes(`href="${ROUTES.ANALYTICS}"`));
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toContain(`aria-label="Доход за ${month}: +16${NBSP}295${NBSP}000${NBSP}сум. Открыть аналитику"`);
  });

  it('do not show a 0 while the totals load', () => {
    const html = home({ accounts: ACCOUNTS });

    expect(text(html)).not.toMatch(/Доход за \S+ 0/);
    expect(anchors(html).filter((tag) => tag.includes(`href="${ROUTES.ANALYTICS}"`))).toHaveLength(2);
  });
});

describe('recent records', () => {
  it('are grouped by day with the category, the note and a signed amount', () => {
    const html = text(home({ accounts: ACCOUNTS, totals: totals(1_250_000_000, 18_640_000), records: RECORDS }));

    expect(html).toContain('Последние операции');
    // The circle carries the category's first letter
    expect(html).toContain(`Сегодня П Продукты Супермаркет ${MINUS}186${NBSP}400`);
    expect(html).toContain(`Вчера З Зарплата За сентябрь +12${NBSP}500${NBSP}000`);
  });
});

describe('Home', () => {
  it('stacks the balance card, the month tiles, the capture line and the recent records', () => {
    const html = text(markup(<HomePage />));
    const order = ['Всего на счетах', `Доход за ${monthNameLower(MONTH)}`, 'Запишите одной строкой', 'Последние операции'];

    expect(order.map((part) => html.indexOf(part)).every((index, i, all) => index >= 0 && (i === 0 || index > all[i - 1]))).toBe(true);
  });

  it('no longer has the old today total and attention summary', () => {
    const html = text(markup(<HomePage />));

    expect(html).not.toContain('Потрачено сегодня');
    expect(html).not.toContain('Что важно сейчас');
  });
});

describe('Home after the first launch', () => {
  const fresh = () => text(home({ accounts: ACCOUNTS, totals: totals(0, 0), records: [] }));

  it('tells how to make the first record', () => {
    expect(fresh()).toContain(FIRST_RECORD_HINT);
  });

  it('shows the opening balances, zero tiles and what the line under the balance will say', () => {
    const html = fresh();

    expect(html).toContain(`9${NBSP}743${NBSP}000 сум`);
    expect(html).toContain(`Доход за ${monthNameLower(MONTH)} 0`);
    expect(html).toContain(`Расход за ${monthNameLower(MONTH)} 0`);
    expect(html).toContain('Здесь появится, какую часть дохода вы потратили за месяц.');
  });
});
