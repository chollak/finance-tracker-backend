// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { Account, AccountMove, AccountsOverview } from '@/entities/account';
import type { UsdRates } from '@/entities/rate';
import { useUserStore } from '@/entities/user';
import { apiClient } from '@/shared/api';
import { NBSP } from '@/shared/lib/money';
import { useUndoToastStore } from '@/shared/lib/undo';
import { TransferPage } from './TransferPage';

/**
 * FT-119, boards «Перевод между счетами», «Обмен сумы → доллары» (TransferForm.md): the form opened from the
 * accounts or an account, the accounts chosen in the picker, the amounts on the app's keypad, the move written by
 * POST /api/moves; the form closes and «Перевод записан» / «Обмен записан» comes with «Отменить». Rendered in jsdom
 * with the API answered here.
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
const MOVE: AccountMove = {
  id: 'm1', kind: 'transfer', fromAccountId: 'card', toAccountId: 'cash', fromAmountMinor: 50_000_000, toAmountMinor: 50_000_000,
  dealRateMinor: null, cbuRateMinor: null, date: '2026-10-14', note: null, createdAt: '2026-10-14T10:00:00.000Z', deletedAt: null,
};

let overview: AccountsOverview;
let root: Root;
let container: HTMLDivElement;
let router: ReturnType<typeof createMemoryRouter>;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  overview = BOARD;
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url === '/accounts') return { success: true, data: overview } as never;
    if (url === '/rates/usd') return { success: true, data: RATES } as never;
    return new Promise<never>(() => {});
  });
  vi.mocked(apiClient.post).mockReset();
  vi.mocked(apiClient.delete).mockReset();
  useUserStore.setState({ userId: USER_ID, userType: 'telegram', telegramId: USER_ID, userName: 'Шукур' });
  useUndoToastStore.setState({ stack: [], openSheets: 0 });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.history.replaceState(null, '');
});

async function renderTransfer(search = '', before: string[] = ['/accounts']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  router = createMemoryRouter(
    [
      { path: '/', element: <p>Главная</p> },
      { path: '/accounts', element: <p>Список счетов</p> },
      { path: '/accounts/transfer', element: <TransferPage /> },
      { path: '/accounts/:id', element: <p>Экран счёта</p> },
    ],
    { initialEntries: [...before, `/accounts/transfer${search}`], initialIndex: before.length }
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
/** A button whose accessible name starts so: the account and amount buttons say their numbers after it. */
function buttonStarting(prefix: string): HTMLButtonElement {
  const found = buttons().find((item) => (item.getAttribute('aria-label') ?? item.textContent?.trim() ?? '').startsWith(prefix));
  if (!found) throw new Error(`No button starting «${prefix}»`);
  return found;
}
async function click(element: HTMLElement) {
  await act(async () => element.click());
  await settle();
}
async function keys(value: string) {
  for (const key of value.split('')) await click(button(key));
}
/** An account in the open picker. */
async function pick(name: string) {
  const option = [...document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] [role="radio"]')].find((item) =>
    item.textContent?.startsWith(name)
  );
  if (!option) throw new Error(`No account «${name}» in the picker`);
  await click(option);
}
/** Money as formatMinor writes it; a rate keeps a plain space before « сум за $1». */
const rate = (value: string) => value.replace(/(\d) (?=\d)/g, `$1${NBSP}`);
const sum = (value: string) => rate(value).replace(/(\d) (сум|USD)/g, `$1${NBSP}$2`);
const lastToast = () => useUndoToastStore.getState().stack.at(-1);

describe('Transfer form', () => {
  it('a transfer between сум accounts: the amount, what becomes of both, «Перевести», a toast with «Отменить»', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ success: true, data: MOVE } as never);
    vi.mocked(apiClient.delete).mockResolvedValue({ success: true, data: { ...MOVE, deletedAt: 'now' } } as never);
    await renderTransfer();

    expect(document.body.querySelector('h1')?.textContent).toBe('Перевод');
    expect(text()).toContain('Перевод не попадает в расходы и аналитику — деньги просто меняют счёт.');
    expect(button('Введите сумму').disabled).toBe(true);

    await keys('500');
    await click(button('Три нуля'));
    expect(text()).toContain(sum('На счёте 3 180 000 сум · останется 2 680 000 сум'));
    expect(text()).toContain(sum('На счёте 1 250 000 сум · станет 1 750 000 сум'));
    await click(button(sum('Перевести 500 000 сум')));

    expect(apiClient.post).toHaveBeenCalledWith('/moves', { kind: 'transfer', fromAccountId: 'card', toAccountId: 'cash', amountMinor: 50_000_000 });
    expect(router.state.location.pathname).toBe('/accounts');
    expect(lastToast()).toMatchObject({ title: 'Перевод записан', detail: sum('Карта → Наличные · 500 000 сум') });

    await act(async () => lastToast()!.undo!());
    expect(apiClient.delete).toHaveBeenCalledWith('/moves/m1');
  });

  it('an exchange: «Получаю» by the Central Bank first, then what really came, the deal rate and the difference', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ success: true, data: { ...MOVE, kind: 'exchange', toAccountId: 'usd' } } as never);
    await renderTransfer();

    await click(buttonStarting('Куда: счёт Наличные'));
    expect(document.body.querySelector('[role="dialog"] h2')?.textContent).toBe('Куда');
    await pick('Доллары');

    expect(document.body.querySelector('h1')?.textContent).toBe('Обмен');
    await keys('1280');
    await click(button('Три нуля'));
    expect(text()).toContain('по курсу ЦБ');
    expect(text()).toContain('101,19');

    await click(buttonStarting('Получаю:'));
    await keys('100');
    expect(text()).not.toContain('по курсу ЦБ');
    expect(text()).toContain(rate('Курс сделки: 12 800 сум за $1'));
    expect(text()).toContain(sum('По курсу ЦБ — 1 265 000 сум, разница 15 000 сум не в вашу пользу.'));
    expect(text()).toContain('Обмен не попадает в расходы и аналитику. Курс сделки сохранится в записи.');
    // The dollar field types with a comma, not «000»
    expect(button('Запятая')).toBeTruthy();

    await click(button(sum('Обменять 1 280 000 сум')));
    expect(apiClient.post).toHaveBeenCalledWith('/moves', {
      kind: 'exchange', fromAccountId: 'card', toAccountId: 'usd', fromAmountMinor: 128_000_000, toAmountMinor: 10_000,
    });
    expect(lastToast()).toMatchObject({ title: 'Обмен записан', detail: sum('1 280 000 сум → 100,00 USD') });
  });

  it('from a dollar account it opens as an exchange to сум', async () => {
    await renderTransfer('?from=usd');

    expect(document.body.querySelector('h1')?.textContent).toBe('Обмен');
    expect(buttonStarting('Отдаю со счёта Доллары')).toBeTruthy();
    expect(buttonStarting('Получаю на счёт Наличные')).toBeTruthy();
  });

  it('swaps the accounts', async () => {
    await renderTransfer();

    await click(button('Поменять счета местами'));

    expect(buttonStarting('Откуда: счёт Наличные')).toBeTruthy();
    expect(buttonStarting('Куда: счёт Карта')).toBeTruthy();
  });

  it('more than is on the account cannot be sent', async () => {
    await renderTransfer();

    await keys('4');
    await click(button('Три нуля'));
    await click(button('Три нуля'));

    expect(text()).toContain(sum('На счёте «Карта» только 3 180 000 сум — меньше суммы'));
    await click(button('Не хватает денег на счёте'));
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('leaving during the save is not followed by another step back; the toast still offers «Отменить» (FT-141)', async () => {
    let answer: (value: unknown) => void = () => {};
    vi.mocked(apiClient.post).mockImplementation(() => new Promise((resolve) => (answer = resolve)) as never);
    vi.mocked(apiClient.delete).mockResolvedValue({ success: true, data: { ...MOVE, deletedAt: 'now' } } as never);
    await renderTransfer('', ['/', '/accounts']);
    // In the app react-router keeps the entry's index in history.state: closing is then one step back
    window.history.replaceState({ idx: 2 }, '');

    await keys('500');
    await click(button(sum('Перевести 500 сум')));
    // «Назад» while the move is being written
    await act(async () => router.navigate(-1));
    await settle();
    expect(router.state.location.pathname).toBe('/accounts');

    await act(async () => answer({ success: true, data: MOVE }));
    await settle();

    expect(router.state.location.pathname).toBe('/accounts');
    expect(text()).toContain('Список счетов');
    expect(lastToast()).toMatchObject({ title: 'Перевод записан' });
    await act(async () => lastToast()!.undo!());
    expect(apiClient.delete).toHaveBeenCalledWith('/moves/m1');
  });

  it('an exchange to dollars shows the empty «Получаю» as «0,00» (FT-141)', async () => {
    await renderTransfer();

    await click(buttonStarting('Куда: счёт Наличные'));
    await pick('Доллары');

    expect(buttonStarting('Получаю:').textContent).toBe('0,00USD');
  });

  it('a failed save keeps the form with what was typed and says why', async () => {
    vi.mocked(apiClient.post).mockRejectedValue({ statusCode: 0, message: 'Network Error' });
    await renderTransfer();

    await keys('5');
    await click(button(sum('Перевести 5 сум')));

    expect(router.state.location.pathname).toBe('/accounts/transfer');
    expect(text()).toContain('Нет связи. Проверьте её и нажмите ещё раз');
    expect(lastToast()).toBeUndefined();
  });

  it('with one visible account it says a second account is needed', async () => {
    overview = { ...BOARD, accounts: [CARD, { ...CASH, isHidden: true }, { ...USD, isHidden: true }] };
    await renderTransfer();

    expect(text()).toContain('Для перевода нужен второй счёт');
    await click(button('К счетам'));
    expect(router.state.location.pathname).toBe('/accounts');
  });

  it('a guest is told accounts come after signing in', async () => {
    useUserStore.setState({ userId: 'guest-1', userType: 'guest', telegramId: null, userName: null });
    await renderTransfer();

    expect(text()).toContain('Счета — после входа');
  });
});
