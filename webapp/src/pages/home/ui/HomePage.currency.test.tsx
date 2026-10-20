// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { apiClient } from '@/shared/api';
import { accountKeys, type Account, type AccountsOverview } from '@/entities/account';
import { categoryKeys } from '@/entities/category';
import { rateKeys, type UsdRates } from '@/entities/rate';
import { settingsKeys, type UserSettings } from '@/entities/settings';
import { transactionKeys, type PeriodTotals } from '@/entities/transaction';
import { useUserStore } from '@/entities/user';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import { ROUTES } from '@/shared/lib/constants/routes';
import { monthBounds, monthNameLower, toLocalDate } from '@/shared/lib/dates';
import { MINUS, NBSP } from '@/shared/lib/money';
import { useUndoToastStore, visibleEntry } from '@/shared/lib/undo';
import { RECENT_LIMIT } from '@/widgets/recent-transactions';
import { HomePage } from './HomePage';

/**
 * FT-137, boards «Главная», «Главная · тёмная»: «Сум / USD» in the header turns the balance card and the
 * month tiles into dollars at the rate in effect; the choice is the user's setting, so it holds between
 * launches; without a rate «USD» cannot be chosen, Home says why, and the total in сум stays as it is.
 * Home rendered in jsdom with its reads answered; the API client is a stub, so nothing reaches the network.
 */

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  const pending = () => new Promise<never>(() => {});
  return {
    ...actual,
    apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending) },
  };
});

const USER_ID = '900000001';
const TODAY = toLocalDate(new Date());
const MONTH = monthBounds(TODAY);
const MONTH_NAME = monthNameLower(Number(TODAY.slice(5, 7)));

function account(overrides: Partial<Account>): Account {
  return {
    id: 'card', name: 'Карта', kind: 'card', currency: 'UZS', openingBalanceMinor: 0, openingDate: TODAY,
    isHidden: false, sortOrder: 10, balanceMinor: 0, ...overrides,
  };
}

// The board: 1 250 000 + 3 180 000 сум + 420,00 USD at 12 650 = 9 743 000 сум = 770,20 USD
const RATE = { rateMinor: 1_265_000, source: 'cbu' as const, date: TODAY };
const ACCOUNTS: AccountsOverview = {
  accounts: [
    account({ id: 'cash', name: 'Наличные', kind: 'cash', balanceMinor: 125_000_000, sortOrder: 10 }),
    account({ id: 'card', name: 'Карта', balanceMinor: 318_000_000, sortOrder: 20 }),
    account({ id: 'usd', name: 'Доллары', kind: 'cash', currency: 'USD', balanceMinor: 42_000, sortOrder: 30 }),
  ],
  totalMinor: 974_300_000,
  rate: RATE,
  missingRate: false,
};

const TOTALS: PeriodTotals = {
  ...MONTH,
  incomeMinor: 1_629_500_000,
  expenseMinor: 768_440_000,
  netMinor: 861_060_000,
  recordCount: 12,
  needsReview: { count: 0, totalMinor: 0 },
  excludedMovementsMinor: 0,
  usd: { present: true, missingRate: false, rateMinor: RATE.rateMinor },
};

function settings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    userId: USER_ID, theme: 'telegram', dailySummaryEnabled: true, dailySummaryTime: '21:00', auditEnabled: true,
    auditTime: '10:00', goalAlertsEnabled: true, fxOwnRateMinor: null, fxOwnSince: null, defaultAccountId: null,
    onboardedAt: '2026-10-14T09:00:00.000Z', receiptTipsSeen: 0, auditInviteSnoozedUntil: null, displayCurrency: 'UZS',
    ...overrides,
  };
}

const WITH_RATE: UsdRates = { effective: RATE, cbu: { rateMinor: RATE.rateMinor, date: TODAY, fetchedAt: `${TODAY}T04:00:00.000Z` }, own: null };
const NO_RATE: UsdRates = { effective: null, cbu: null, own: null };

let client: QueryClient;
let root: Root | null = null;
let container: HTMLDivElement;

/** Home with its reads answered: the board's accounts and month, no records yet. */
function seed({ chosen = 'UZS', rates = WITH_RATE, accounts = ACCOUNTS }: { chosen?: 'UZS' | 'USD'; rates?: UsdRates; accounts?: AccountsOverview } = {}) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(settingsKeys.detail(USER_ID), settings({ displayCurrency: chosen }));
  client.setQueryData(rateKeys.usd(USER_ID), rates);
  client.setQueryData(accountKeys.list(USER_ID), accounts);
  client.setQueryData(transactionKeys.totals(USER_ID, MONTH), TOTALS);
  client.setQueryData(transactionKeys.recent(USER_ID, RECENT_LIMIT), []);
  client.setQueryData(categoryKeys.list(USER_ID), []);
}

async function renderHome(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[ROUTES.HOME]}>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>
    );
  });
  await settle();
}

const group = () => container.querySelector('[role="group"][aria-label="Валюта отображения"]');
const segment = (label: string) =>
  [...(group()?.querySelectorAll('button') ?? [])].find((button) => button.textContent === label) as HTMLButtonElement;
/** The text of an element as it reads on screen: its pieces apart, ordinary spaces collapsed, the non-breaking kept. */
function shownText(element: Element | null | undefined): string {
  if (!element) return '';
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) parts.push(node.textContent ?? '');
  return parts.join(' ').replace(/[ \t\n\r]+/g, ' ').trim();
}
const balance = () => shownText(container.querySelector('section[aria-label="Баланс"]'));
const tile = (kind: 'Доход' | 'Расход') =>
  shownText([...container.querySelectorAll('a')].find((link) => link.textContent?.startsWith(`${kind} за`)));
const shownToast = () => visibleEntry(useUndoToastStore.getState().stack, Date.now());

/** Lets the answered reads and saves reach the screen (TanStack tells its observers on a timer). */
async function settle(): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function press(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.click();
  });
  await settle();
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  useUndoToastStore.getState().clear();
  useUserStore.setState({ userId: USER_ID, userType: 'telegram', telegramId: USER_ID, userName: 'Шукур' });
  vi.mocked(apiClient.patch).mockReset();
  vi.mocked(apiClient.get).mockReset().mockImplementation(() => new Promise<never>(() => {}));
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('«Сум / USD» in the header of Home', () => {
  it('stands beside «Ещё», with сум chosen for a user who never chose', async () => {
    seed();
    await renderHome();

    const header = container.querySelector('header');
    expect(header?.contains(group())).toBe(true);
    expect(segment('Сум').getAttribute('aria-pressed')).toBe('true');
    expect(segment('USD').getAttribute('aria-pressed')).toBe('false');
    expect(balance()).toContain(`9${NBSP}743${NBSP}000 сум`);
  });

  it('turns the balance card and the month tiles into dollars at the rate in effect', async () => {
    seed();
    vi.mocked(apiClient.patch).mockResolvedValue({ data: settings({ displayCurrency: 'USD' }) });
    await renderHome();

    await press(segment('USD'));

    expect(segment('USD').getAttribute('aria-pressed')).toBe('true');
    expect(balance()).toContain('770,20 USD');
    expect(tile('Доход')).toContain(`+1${NBSP}288,14`);
    expect(tile('Расход')).toContain(`${MINUS}607,46`);
    // The accounts inside the card stay in their own currencies
    expect(balance()).toContain('3 счёта');
  });

  it('remembers the choice in the user’s settings', async () => {
    seed();
    vi.mocked(apiClient.patch).mockResolvedValue({ data: settings({ displayCurrency: 'USD' }) });
    await renderHome();

    await press(segment('USD'));

    expect(apiClient.patch).toHaveBeenCalledWith(API_ENDPOINTS.SETTINGS, { displayCurrency: 'USD' });
    expect(client.getQueryData<UserSettings>(settingsKeys.detail(USER_ID))?.displayCurrency).toBe('USD');
  });

  it('opens in dollars when dollars were chosen before', async () => {
    seed({ chosen: 'USD' });
    await renderHome();

    expect(segment('USD').getAttribute('aria-pressed')).toBe('true');
    expect(balance()).toContain('770,20 USD');
  });

  it('goes back to сум with «Сум»', async () => {
    seed({ chosen: 'USD' });
    vi.mocked(apiClient.patch).mockResolvedValue({ data: settings({ displayCurrency: 'UZS' }) });
    await renderHome();

    await press(segment('Сум'));

    expect(balance()).toContain(`9${NBSP}743${NBSP}000 сум`);
    expect(tile('Доход')).toContain(`+16${NBSP}295${NBSP}000`);
    expect(apiClient.patch).toHaveBeenCalledWith(API_ENDPOINTS.SETTINGS, { displayCurrency: 'UZS' });
  });

  it('puts the choice back and says so when it could not be saved', async () => {
    seed();
    vi.mocked(apiClient.patch).mockRejectedValue({ message: 'Network error', statusCode: 0 });
    await renderHome();

    await press(segment('USD'));

    expect(segment('Сум').getAttribute('aria-pressed')).toBe('true');
    expect(balance()).toContain(`9${NBSP}743${NBSP}000 сум`);
    expect(shownToast()).toMatchObject({ kind: 'info', title: 'Не получилось переключить валюту' });
  });
});

describe('without a USD rate', () => {
  // No rate yet: no dollar account here, so the total is whole
  const UZS_ONLY: AccountsOverview = { ...ACCOUNTS, accounts: ACCOUNTS.accounts.slice(0, 2), totalMinor: 443_000_000, rate: null };

  it('«USD» cannot be chosen and says why; the total in сум stays as it is', async () => {
    seed({ rates: NO_RATE, accounts: UZS_ONLY });
    await renderHome();

    expect(segment('USD').getAttribute('aria-disabled')).toBe('true');
    expect(segment('USD').getAttribute('aria-label')).toBe('USD — курса доллара пока нет');

    await press(segment('USD'));

    expect(apiClient.patch).not.toHaveBeenCalled();
    expect(segment('Сум').getAttribute('aria-pressed')).toBe('true');
    expect(balance()).toContain(`4${NBSP}430${NBSP}000 сум`);
    expect(shownToast()).toMatchObject({ kind: 'info', title: 'Курса доллара пока нет', detail: 'Покажем в долларах, когда появится курс' });
  });

  it('shows сум even when dollars were chosen, and keeps that choice for when a rate comes', async () => {
    seed({ chosen: 'USD', rates: NO_RATE, accounts: UZS_ONLY });
    await renderHome();

    expect(segment('Сум').getAttribute('aria-pressed')).toBe('true');
    expect(balance()).toContain(`4${NBSP}430${NBSP}000 сум`);
    expect(tile('Доход')).toContain(`+16${NBSP}295${NBSP}000`);
    expect(client.getQueryData<UserSettings>(settingsKeys.detail(USER_ID))?.displayCurrency).toBe('USD');
  });

  it('when the rate did not load, pressing «USD» says so and reads it again', async () => {
    seed();
    client.removeQueries({ queryKey: rateKeys.usd(USER_ID) });
    vi.mocked(apiClient.get).mockImplementation((endpoint: string) =>
      endpoint === API_ENDPOINTS.RATES.USD ? Promise.reject({ message: 'Network error', statusCode: 0 }) : new Promise<never>(() => {})
    );
    await renderHome(); // the failed read settles and Home comes in place of its skeleton

    expect(segment('USD').getAttribute('aria-disabled')).toBe('true');
    const reads = vi.mocked(apiClient.get).mock.calls.filter(([endpoint]) => endpoint === API_ENDPOINTS.RATES.USD).length;

    await press(segment('USD'));

    expect(shownToast()).toMatchObject({ kind: 'info', title: 'Не удалось загрузить курс доллара' });
    expect(vi.mocked(apiClient.get).mock.calls.filter(([endpoint]) => endpoint === API_ENDPOINTS.RATES.USD).length).toBe(reads + 1);
    expect(apiClient.patch).not.toHaveBeenCalled();
  });
});

describe('the month name', () => {
  it('the tiles keep their labels in dollars', async () => {
    seed({ chosen: 'USD' });
    await renderHome();

    expect(tile('Доход')).toContain(`Доход за ${MONTH_NAME}`);
  });
});
