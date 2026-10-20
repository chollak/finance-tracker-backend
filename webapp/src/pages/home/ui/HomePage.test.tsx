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
import { BalanceCardView } from '@/widgets/balance-card';
import { SummaryTilesView } from '@/widgets/summary-tiles';
import { FIRST_RECORD_HINT, RecentRecordsView } from '@/widgets/recent-transactions';
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
  /** Which reads failed. */
  failed?: Array<'accounts' | 'totals' | 'records'>;
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
function home({ accounts, totals: monthTotals, records, expanded = false, failed = [] }: View): string {
  const query = <T,>(data: T | undefined, name: 'accounts' | 'totals' | 'records') => ({ data, isError: failed.includes(name) });
  return markup(
    <>
      <BalanceCardView
        accounts={query(accounts, 'accounts')}
        totals={query(monthTotals, 'totals')}
        month={MONTH}
        expanded={expanded}
        onToggle={() => {}}
        onRetry={() => {}}
      />
      <SummaryTilesView totals={query(monthTotals, 'totals')} year={Number(TODAY.slice(0, 4))} month={MONTH} />
      <RecentRecordsView records={query(records, 'records')} categories={CATEGORIES} today={TODAY} onOpen={() => {}} onRetry={() => {}} />
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

  it('names the list it opens only while the list is there', () => {
    expect(board()).not.toMatch(/aria-controls=/);

    const open = home({ accounts: ACCOUNTS, totals: totals(0, 0), expanded: true });
    const controls = open.match(/aria-controls="([^"]+)"/)?.[1];
    expect(controls).toBeDefined();
    expect(open).toContain(`<ul id="${controls}"`);
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

describe('a dollar account without a rate', () => {
  const noRate: AccountsOverview = { ...ACCOUNTS, totalMinor: 443_000_000, rate: null, missingRate: true };
  const NOTE = 'Доллары не вошли в итог: курса пока нет';

  it('the closed card says the total leaves the dollars out', () => {
    expect(text(home({ accounts: noRate, totals: totals(0, 0) }))).toContain(NOTE);
  });

  it('the open card says it once', () => {
    expect(text(home({ accounts: noRate, totals: totals(0, 0), expanded: true })).split(NOTE)).toHaveLength(2);
  });

  it('the tiles say their sums leave the dollars out', () => {
    const monthTotals = { ...totals(0, 18_000_000), usd: { present: true, missingRate: true, rateMinor: null } };

    expect(text(home({ accounts: noRate, totals: monthTotals }))).toContain('Доллары не вошли в итоги месяца: курса пока нет');
    expect(text(home({ accounts: ACCOUNTS, totals: totals(0, 18_000_000) }))).not.toContain('Доллары не вошли');
  });
});

describe('when a read fails', () => {
  const RETRY = /<button[^>]*>Попробовать снова<\/button>/g;

  it('the card says the balances did not load and offers to read them again', () => {
    const html = home({ totals: totals(0, 0), records: RECORDS, failed: ['accounts'] });

    expect(text(html)).toContain('Не удалось загрузить остатки.');
    expect(html.match(RETRY)).toHaveLength(1);
  });

  it('the card says the month did not count instead of dropping the line; the tiles show «—»', () => {
    const html = home({ accounts: ACCOUNTS, records: RECORDS, failed: ['totals'] });

    expect(text(html)).toContain(`9${NBSP}743${NBSP}000 сум`);
    expect(text(html)).toContain('Не удалось посчитать итоги месяца.');
    expect(text(html)).toContain(`Доход за ${monthNameLower(MONTH)} —`);
    expect(html.match(RETRY)).toHaveLength(1);
  });

  it('one retry in the card covers the balances and the month together', () => {
    expect(home({ records: RECORDS, failed: ['accounts', 'totals'] }).match(RETRY)).toHaveLength(1);
  });

  it('the recent records say they did not load and offer to read them again', () => {
    const html = home({ accounts: ACCOUNTS, totals: totals(0, 0), failed: ['records'] });

    expect(text(html)).toContain('Не удалось загрузить записи.');
    expect(html.match(RETRY)).toHaveLength(1);
  });

  it('nothing offers a retry while everything reads fine', () => {
    expect(home({ accounts: ACCOUNTS, totals: totals(0, 0), records: RECORDS })).not.toMatch(RETRY);
  });
});

describe('month tiles', () => {
  // FT-121: the income tile opens the income of Analytics, the expense tile its expenses (board «Главная»)
  const incomeTiles = (html: string) => anchors(html).filter((tag) => tag.includes(`href="${ROUTES.ANALYTICS_VIEW({ type: 'income' })}"`));
  const expenseTiles = (html: string) => anchors(html).filter((tag) => tag.includes(`href="${ROUTES.ANALYTICS}"`));

  it('show income and expenses of the month from the totals service; each opens its side of Analytics', () => {
    const html = home({ accounts: ACCOUNTS, totals: totals(1_629_500_000, 768_440_000), records: RECORDS });
    const month = monthNameLower(MONTH);

    expect(text(html)).toContain(`Доход за ${month} +16${NBSP}295${NBSP}000`);
    expect(text(html)).toContain(`Расход за ${month} ${MINUS}7${NBSP}684${NBSP}400`);
    expect(ROUTES.ANALYTICS_VIEW({ type: 'income' })).toBe('/analytics?type=income');
    expect(incomeTiles(html)).toHaveLength(1);
    expect(incomeTiles(html)[0]).toContain(`aria-label="Доход за ${month}: +16${NBSP}295${NBSP}000${NBSP}сум. Открыть аналитику"`);
    expect(expenseTiles(html)).toHaveLength(1);
    expect(expenseTiles(html)[0]).toContain(`aria-label="Расход за ${month}`);
  });

  it('do not show a 0 while the totals load', () => {
    const html = home({ accounts: ACCOUNTS });

    expect(text(html)).not.toMatch(/Доход за \S+ 0/);
    expect(incomeTiles(html)).toHaveLength(1);
    expect(expenseTiles(html)).toHaveLength(1);
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
  it('stacks the balance card, the month tiles and the recent records, with the composer at the bottom (FT-114)', () => {
    const html = text(markup(<HomePage />));
    const order = ['Всего на счетах', `Доход за ${monthNameLower(MONTH)}`, 'Последние операции', 'Новая запись текстом'];

    expect(order.map((part) => html.indexOf(part)).every((index, i, all) => index >= 0 && (i === 0 || index > all[i - 1]))).toBe(true);
  });

  it('shows «Записано» over the composer, and the records do not hide under it (Toast.md, Composer.md)', () => {
    const html = markup(<HomePage />);

    expect(html).toMatch(/role="status" aria-live="polite"[^>]*style="bottom:calc\(160px/);
    expect(html).toMatch(/class="[^"]*pb-\[calc\(10rem\+env\(safe-area-inset-bottom\)\)\]/);
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
