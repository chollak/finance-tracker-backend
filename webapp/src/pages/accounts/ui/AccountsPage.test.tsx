// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, useParams } from 'react-router-dom';
import type { Account, AccountsOverview } from '@/entities/account';
import type { UsdRates } from '@/entities/rate';
import { useUserStore } from '@/entities/user';
import { apiClient } from '@/shared/api';
import { NBSP } from '@/shared/lib/money';
import { useUndoToastStore } from '@/shared/lib/undo';
import { AccountsPage } from './AccountsPage';

/**
 * FT-118, boards «Счета · итог, курс, список», «Новый счёт», «Скрытые счета»: the list reads GET /api/accounts and
 * the rate, a row opens its account, «Добавить счёт» adds one with its balance now, hidden accounts come back with
 * «Показать» and «Отменить», and a transfer with one visible account says it needs a second. Rendered in jsdom with
 * the API answered here.
 */

vi.mock('@/shared/api/client', () => {
  const pending = () => new Promise<never>(() => {});
  return { apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending) } };
});

const USER_ID = '900000001';

const account = (overrides: Partial<Account>): Account => ({
  id: 'card', name: 'Карта', kind: 'card', currency: 'UZS', openingBalanceMinor: 0, openingDate: '2026-08-01', isHidden: false, sortOrder: 20, balanceMinor: 0, ...overrides,
});
const CASH = account({ id: 'cash', name: 'Наличные', kind: 'cash', balanceMinor: 125_000_000, sortOrder: 10 });
const CARD = account({ id: 'card', balanceMinor: 318_000_000 });
const USD = account({ id: 'usd', name: 'Доллары', kind: 'cash', currency: 'USD', balanceMinor: 42_000, sortOrder: 30 });

const BOARD: AccountsOverview = {
  accounts: [CASH, CARD, USD],
  totalMinor: 974_300_000,
  rate: { rateMinor: 1_265_000, source: 'cbu', date: '2026-10-14' },
  missingRate: false,
};
const RATES: UsdRates = {
  effective: { rateMinor: 1_265_000, source: 'cbu', date: '2026-10-14' },
  cbu: { rateMinor: 1_265_000, date: '2026-10-14', fetchedAt: '2026-10-14T04:00:00.000Z' },
  own: null,
};

let overview: AccountsOverview;
let root: Root;
let container: HTMLDivElement;
let router: ReturnType<typeof createMemoryRouter>;

function AccountScreenStub() {
  const { id } = useParams();
  return <p>Экран счёта {id}</p>;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  overview = BOARD;
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url === '/accounts') return { success: true, data: overview } as never;
    if (url === '/rates/usd') return { success: true, data: RATES } as never;
    return new Promise<never>(() => {});
  });
  vi.mocked(apiClient.post).mockReset();
  vi.mocked(apiClient.patch).mockReset();
  useUserStore.setState({ userId: USER_ID, userType: 'telegram', telegramId: USER_ID, userName: 'Шукур' });
  useUndoToastStore.setState({ stack: [], openSheets: 0 });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderAccounts() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  router = createMemoryRouter(
    [
      { path: '/accounts', element: <AccountsPage /> },
      { path: '/accounts/:id', element: <AccountScreenStub /> },
    ],
    { initialEntries: ['/accounts'] }
  );
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );
  });
  await settle();
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const text = () => document.body.textContent?.replace(/[ \t\n\r]+/g, ' ') ?? '';
const buttons = () => [...document.body.querySelectorAll<HTMLButtonElement>('button')];
function button(name: string): HTMLButtonElement {
  const found = buttons().find((item) => item.getAttribute('aria-label') === name || item.textContent?.trim() === name);
  if (!found) throw new Error(`No button «${name}» among: ${buttons().map((item) => item.getAttribute('aria-label') ?? item.textContent?.trim()).join(' | ')}`);
  return found;
}
async function press(name: string) {
  await act(async () => button(name).click());
  await settle();
}
/** A button of the open sheet: the list behind it has its own «Добавить счёт». */
async function pressInSheet(name: string) {
  const sheet = document.body.querySelector('[role="dialog"]')!;
  const found = [...sheet.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.getAttribute('aria-label') === name || item.textContent?.trim() === name);
  if (!found) throw new Error(`No button «${name}» in the sheet`);
  await act(async () => found.click());
  await settle();
}
async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('Accounts', () => {
  it('shows the total, the rate it is counted at, the rate row and the accounts with «≈» under dollars', async () => {
    await renderAccounts();

    expect(document.body.querySelector('h1')?.textContent).toBe('Счета');
    expect(text()).toContain('Всего на счетах');
    expect(text()).toContain(`9${NBSP}743${NBSP}000`);
    expect(text()).toContain(`Доллары — по курсу ЦБ на 14 окт, 12${NBSP}650 сум`);
    expect(text()).toContain(`Курс доллара · 12${NBSP}650 сум`);
    expect(text()).toContain('ЦБ на 14 окт');
    expect(button(`Доллары, 420,00${NBSP}USD, примерно 5${NBSP}313${NBSP}000${NBSP}сум. Открыть счёт`)).toBeTruthy();
    expect(text()).toContain(`≈${NBSP}5${NBSP}313${NBSP}000${NBSP}сум`);
    expect(text()).toContain('Добавить счёт');
    expect(text()).not.toContain('Скрытые счета');
    expect(button('Перевод или обмен').getAttribute('aria-disabled')).not.toBe('true');
  });

  it('a row opens its account', async () => {
    await renderAccounts();

    await press(`Карта, 3${NBSP}180${NBSP}000${NBSP}сум. Открыть счёт`);

    expect(router.state.location.pathname).toBe('/accounts/card');
    expect(text()).toContain('Экран счёта card');
  });

  it('with one visible account a transfer is not offered, and the button says why', async () => {
    overview = { ...BOARD, accounts: [CARD, { ...CASH, isHidden: true }], rate: null };
    await renderAccounts();

    expect(button('Для перевода нужен второй счёт').getAttribute('aria-disabled')).toBe('true');
  });

  it('«Добавить счёт»: a name, the type, the currency and the balance now; the account is added', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ success: true, data: account({ id: 'piggy', name: 'Копилка', kind: 'cash', openingBalanceMinor: 50_000_000 }) } as never);
    await renderAccounts();

    await press('Добавить счёт');
    expect(document.body.querySelector('[role="dialog"] h2')?.textContent).toBe('Новый счёт');
    expect(button('Введите название').disabled).toBe(true);

    await type(document.body.querySelector<HTMLInputElement>('[role="dialog"] input')!, 'Копилка');
    for (const key of ['5', '0', '0', 'Три нуля']) await press(key);
    expect(text()).toContain(`500${NBSP}000`);
    expect(text()).toContain('Это начальный остаток — он не попадёт в доходы.');

    await pressInSheet('Добавить счёт');

    expect(apiClient.post).toHaveBeenCalledWith('/accounts', { name: 'Копилка', kind: 'cash', currency: 'UZS', openingBalanceMinor: 50_000_000 });
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(text()).toContain('Счёт добавлен');
    expect(text()).toContain(`Копилка · 500${NBSP}000${NBSP}сум`);
  });

  it('a name already taken keeps the sheet open and says so', async () => {
    vi.mocked(apiClient.post).mockRejectedValue({ statusCode: 409, message: 'Request failed', serverMessage: 'Account «Карта» already exists' });
    await renderAccounts();

    await press('Добавить счёт');
    await type(document.body.querySelector<HTMLInputElement>('[role="dialog"] input')!, 'карта');
    await pressInSheet('Добавить счёт');

    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    expect(text()).toContain('Счёт с таким названием уже есть — выберите другое');
  });

  it('hidden accounts: «Скрытые счета · 1», «Показать» brings it back, «Отменить» hides it again', async () => {
    overview = { ...BOARD, accounts: [CASH, CARD, { ...USD, isHidden: true }], totalMinor: 443_000_000, rate: null };
    vi.mocked(apiClient.patch).mockResolvedValue({ success: true, data: USD } as never);
    await renderAccounts();

    expect(text()).toContain('Все счета в сумах');
    await press('Скрытые счета · 1');
    expect(text()).toContain('Скрытые счета не входят в итог и не предлагаются при записи');
    expect(text()).toContain(`420,00${NBSP}USD`);

    await press('Показать счёт «Доллары»');

    expect(apiClient.patch).toHaveBeenCalledWith('/accounts/usd', { isHidden: false });
    // The last hidden account is back: the sheet closes and the toast shows
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(text()).toContain('Счёт снова виден');

    await press('Отменить');
    expect(apiClient.patch).toHaveBeenLastCalledWith('/accounts/usd', { isHidden: true });
  });

  it('the rate row opens the Central Bank rate with its date', async () => {
    await renderAccounts();

    await press(`Курс доллара · 12${NBSP}650 сум, ЦБ на 14 окт`);

    expect(document.body.querySelector('[role="dialog"] h2')?.textContent).toBe('Курс доллара');
    expect(text()).toContain('ЦБ Узбекистана · 14 окт');
    expect(text()).toContain('Обновляется автоматически каждый день.');
    expect(text()).toContain('По этому курсу считаются итог на главной и суммы в долларах.');
  });
});
