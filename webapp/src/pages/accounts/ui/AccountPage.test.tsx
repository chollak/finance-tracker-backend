// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { Account, AccountMove, AccountOperations, AccountsOverview } from '@/entities/account';
import type { Category } from '@/entities/category';
import type { UsdRates } from '@/entities/rate';
import { useUserStore } from '@/entities/user';
import { useRecordSheetStore } from '@/features/record-sheet';
import { apiClient } from '@/shared/api';
import { addDays, dayMonth, toLocalDate } from '@/shared/lib/dates';
import { MINUS, NBSP } from '@/shared/lib/money';
import { useUndoToastStore } from '@/shared/lib/undo';
import type { Transaction } from '@/shared/types';
import { AccountPage } from './AccountPage';

/**
 * FT-118, boards «Счёт «Карта» · операции», «Обмен · подробнее и удаление», «Сверить остаток», «Изменить или
 * скрыть счёт»: the account screen reads GET /api/accounts/:id/operations 60 days at a time; a record opens in History
 * narrowed to the account; a move opens «Подробнее» and is deleted with «Отменить»; «Сверить остаток» records the
 * difference as an adjustment; «Изменить» renames or hides. Rendered in jsdom with the API answered here.
 */

vi.mock('@/shared/api/client', () => {
  const pending = () => new Promise<never>(() => {});
  return { apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending) } };
});

const CATEGORIES: Category[] = [
  { id: 'c-food', type: 'expense', name: 'Продукты', color: 'peach', isHidden: false, isOther: false, sortOrder: 10, presetKey: 'groceries' },
  { id: 'c-salary', type: 'income', name: 'Зарплата', color: 'mint', isHidden: false, isOther: false, sortOrder: 10, presetKey: 'salary' },
];
vi.mock('@/entities/category', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/category')>();
  return { ...actual, useCategories: () => ({ data: CATEGORIES }) };
});

const USER_ID = '900000001';
const TODAY = toLocalDate(new Date());
const YESTERDAY = addDays(TODAY, -1);
const EARLIER = addDays(TODAY, -2);

const account = (overrides: Partial<Account>): Account => ({
  id: 'card', name: 'Карта', kind: 'card', currency: 'UZS', openingBalanceMinor: 200_000_000, openingDate: '2026-08-01', isHidden: false, sortOrder: 20, balanceMinor: 318_000_000, ...overrides,
});
const CARD = account({});
const CASH = account({ id: 'cash', name: 'Наличные', kind: 'cash', openingBalanceMinor: 0, balanceMinor: 125_000_000, sortOrder: 10 });
const USD = account({ id: 'usd', name: 'Доллары', kind: 'cash', currency: 'USD', openingBalanceMinor: 2_000, balanceMinor: 42_000, sortOrder: 30 });

const RATES: UsdRates = {
  effective: { rateMinor: 1_265_000, source: 'cbu', date: TODAY },
  cbu: { rateMinor: 1_265_000, date: TODAY, fetchedAt: `${TODAY}T04:00:00.000Z` },
  own: null,
};

const record = (overrides: Partial<Transaction>): Transaction => ({
  id: 't1', type: 'expense', amount: 186_400, amountMinor: 18_640_000, currency: 'UZS', category: 'Продукты', categoryId: 'c-food',
  description: 'Супермаркет', date: TODAY, userId: USER_ID, accountId: 'card', ...overrides,
});
const EXCHANGE: AccountMove = {
  id: 'm1', kind: 'exchange', fromAccountId: 'usd', toAccountId: 'card', fromAmountMinor: 10_000, toAmountMinor: 126_000_000,
  dealRateMinor: 1_260_000, cbuRateMinor: 1_265_000, date: EARLIER, note: null, createdAt: `${EARLIER}T10:00:00.000Z`, deletedAt: null,
};

let accounts: AccountsOverview;
let operations: AccountOperations;
/** What a window of the account's operations answers, by its `from` and `to`; the board's days by default. */
let operationsFor: (params: URLSearchParams) => AccountOperations;
let operationReads: URLSearchParams[];
let root: Root;
let container: HTMLDivElement;
let router: ReturnType<typeof createMemoryRouter>;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  accounts = { accounts: [CASH, CARD, USD], totalMinor: 974_300_000, rate: { rateMinor: 1_265_000, source: 'cbu', date: TODAY }, missingRate: false };
  const salary = record({ id: 't3', type: 'income', amount: 12_500_000, amountMinor: 1_250_000_000, category: 'Зарплата', categoryId: 'c-salary', description: 'За сентябрь', date: YESTERDAY });
  operations = {
    account: { ...CARD, hasOperations: true },
    days: [
      { date: TODAY, operations: [{ type: 'record', id: 't1', date: TODAY, createdAt: null, amountMinor: -18_640_000, countsInBalance: true, record: record({}) }] },
      { date: YESTERDAY, operations: [{ type: 'record', id: 't3', date: YESTERDAY, createdAt: null, amountMinor: 1_250_000_000, countsInBalance: true, record: salary }] },
      {
        date: EARLIER,
        operations: [
          { type: 'move', id: 'm1', date: EARLIER, createdAt: EXCHANGE.createdAt, amountMinor: 126_000_000, countsInBalance: true, kind: 'exchange', counterpart: { id: 'usd', name: 'Доллары', currency: 'USD' }, move: EXCHANGE },
        ],
      },
    ],
  };
  operationsFor = () => operations;
  operationReads = [];
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    const [path, search = ''] = url.split('?');
    if (path === '/accounts') return { success: true, data: accounts } as never;
    if (path === '/rates/usd') return { success: true, data: RATES } as never;
    if (path === '/accounts/card/operations') {
      const params = new URLSearchParams(search);
      operationReads.push(params);
      return { success: true, data: operationsFor(params) } as never;
    }
    if (path === '/accounts/nope/operations') throw { statusCode: 404, message: 'Account not found' };
    return new Promise<never>(() => {});
  });
  vi.mocked(apiClient.post).mockReset();
  vi.mocked(apiClient.patch).mockReset();
  vi.mocked(apiClient.delete).mockReset();
  useUserStore.setState({ userId: USER_ID, userType: 'telegram', telegramId: USER_ID, userName: 'Шукур' });
  useRecordSheetStore.setState({ target: null, flashId: null });
  useUndoToastStore.setState({ stack: [], openSheets: 0 });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderAccount(id = 'card') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  router = createMemoryRouter(
    [
      { path: '/accounts', element: <p>Список счетов</p> },
      { path: '/accounts/transfer', element: <p>Форма перевода</p> },
      { path: '/accounts/:id', element: <AccountPage /> },
      { path: '/transactions', element: <p>История</p> },
    ],
    { initialEntries: ['/accounts', `/accounts/${id}`], initialIndex: 1 }
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
async function keys(...names: string[]) {
  for (const name of names) await press(name);
}
const dialog = () => document.body.querySelector<HTMLElement>('[role="dialog"]');

describe('Account screen', () => {
  it('shows the balance, the opening balance with its date, the two actions and the operations by day', async () => {
    await renderAccount();

    expect(document.body.querySelector('h1')?.textContent).toBe('Карта');
    expect(button('Изменить')).toBeTruthy();
    expect(text()).toContain('сумы · карта');
    expect(text()).toContain(`3${NBSP}180${NBSP}000`);
    expect(text()).toContain(`Начальный остаток 2${NBSP}000${NBSP}000${NBSP}сум на 1 августа`);
    expect(button('Перевести')).toBeTruthy();
    expect(button('Сверить остаток')).toBeTruthy();
    expect(text()).toContain(`Сегодня, ${dayMonth(TODAY)}`);
    expect(text()).toContain(`Вчера, ${dayMonth(YESTERDAY)}`);
    expect(text()).toContain('Супермаркет');
    expect(text()).toContain(`+12${NBSP}500${NBSP}000`);
    expect(button(`Обмен, Доллары → Карта, +1${NBSP}260${NBSP}000${NBSP}сум. Не в аналитике. Подробнее`)).toBeTruthy();
    // The last 60 days with today first, and anything later
    expect(operationReads.map((params) => params.toString())).toEqual([`from=${addDays(TODAY, -59)}`]);
  });

  it('«Перевести» opens the transfer form from this account (FT-119)', async () => {
    await renderAccount();

    await press('Перевести');

    expect(router.state.location.pathname).toBe('/accounts/transfer');
    expect(Object.fromEntries(new URLSearchParams(router.state.location.search))).toEqual({ from: 'card' });
    expect(text()).toContain('Форма перевода');
    expect(text()).not.toContain('скоро');
  });

  it('a record opens in History narrowed to this account, with its sheet open on the record as listed', async () => {
    await renderAccount();

    // One button, as on the board: no separate category circle here
    expect(buttons().some((item) => item.getAttribute('aria-label')?.startsWith('Сменить категорию'))).toBe(false);
    await press(`Продукты, ${MINUS}186${NBSP}400${NBSP}сум, Супермаркет. Открыть в истории`);

    const { pathname, search, state } = router.state.location;
    expect(pathname).toBe('/transactions');
    expect(Object.fromEntries(new URLSearchParams(search))).toEqual({ account: 'card', record: 't1' });
    expect((state as { recordSeed?: Transaction }).recordSeed).toMatchObject({ id: 't1', description: 'Супермаркет' });
    // The sheet itself is History's: nothing is opened on the account screen
    expect(useRecordSheetStore.getState().target).toBeNull();
  });

  it('reads earlier days 60 at a time as the list comes to its end', async () => {
    const OLD = addDays(TODAY, -75);
    const older = record({ id: 't9', description: 'Старая покупка', date: OLD });
    operationsFor = (params) =>
      params.get('to') === OLD
        ? {
            ...operations,
            days: [{ date: OLD, operations: [{ type: 'record', id: 't9', date: OLD, createdAt: null, amountMinor: -18_640_000, countsInBalance: true, record: older }] }],
            earlierDate: null,
          }
        : { ...operations, earlierDate: OLD };
    await renderAccount();

    expect(text()).not.toContain('Старая покупка');
    // jsdom has no IntersectionObserver: the end of the list is a button
    await press('Показать ещё');

    expect(operationReads[1].get('from')).toBe(addDays(OLD, -59));
    expect(operationReads[1].get('to')).toBe(OLD);
    expect(text()).toContain('Старая покупка');
    expect(text()).toContain('Супермаркет');
    expect(buttons().some((item) => item.textContent?.trim() === 'Показать ещё')).toBe(false);
  });

  it('nothing in the last 60 days but earlier operations: no «Операций пока нет», the earlier days are offered', async () => {
    operationsFor = (params) => (params.get('to') ? operations : { ...operations, days: [], earlierDate: TODAY });
    await renderAccount();

    expect(text()).not.toContain('Операций пока нет');
    expect(button('Показать ещё')).toBeTruthy();
  });

  it('«Подробнее» of an exchange deletes it with «Отменить», which brings it back', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ success: true, data: { ...EXCHANGE, deletedAt: new Date().toISOString() } } as never);
    vi.mocked(apiClient.post).mockResolvedValue({ success: true, data: EXCHANGE } as never);
    await renderAccount();

    await press(`Обмен, Доллары → Карта, +1${NBSP}260${NBSP}000${NBSP}сум. Не в аналитике. Подробнее`);
    expect(dialog()?.querySelector('h2')?.textContent).toBe(`Обмен, ${dayMonth(EARLIER)}`);
    expect(dialog()?.textContent).toContain(`100,00${NBSP}USD · Доллары`);
    expect(dialog()?.textContent).toContain(`12${NBSP}600 сум за $1`);
    // No main button in this sheet: deleting is the secondary one
    expect(buttons().some((item) => item.textContent?.trim() === 'Готово')).toBe(false);

    await press('Удалить обмен');

    expect(apiClient.delete).toHaveBeenCalledWith('/moves/m1');
    expect(dialog()).toBeNull();
    expect(text()).toContain('Обмен удалён');

    await press('Отменить');
    expect(apiClient.post).toHaveBeenCalledWith('/moves/m1/restore');
  });

  it('«Сверить остаток»: an empty field and the same balance keep the button off; a difference is an adjustment', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ success: true, data: { ...EXCHANGE, id: 'adj1', kind: 'adjustment', fromAccountId: null, fromAmountMinor: null, toAmountMinor: 2_000_000, date: TODAY } } as never);
    vi.mocked(apiClient.delete).mockResolvedValue({ success: true, data: {} } as never);
    await renderAccount();

    await press('Сверить остаток');
    expect(dialog()?.querySelector('h2')?.textContent).toBe('Сколько сейчас на счёте «Карта»?');
    const confirm = () => [...dialog()!.querySelectorAll('button')].find((item) => item.textContent?.trim() === 'Сверить остаток')!;
    expect(confirm().disabled).toBe(true);
    expect(dialog()?.textContent).toContain(`Сейчас в Daftar — 3${NBSP}180${NBSP}000${NBSP}сум.`);

    await keys('3', '1', '8', '0', 'Три нуля');
    expect(dialog()?.textContent).toContain('Совпадает с Daftar — исправлять нечего.');
    expect(confirm().disabled).toBe(true);

    await keys('Стереть', 'Стереть', 'Стереть', 'Стереть', 'Стереть', 'Стереть', 'Стереть');
    await keys('3', '2', '0', '0', 'Три нуля');
    expect(dialog()?.textContent).toContain(`Разница +20${NBSP}000${NBSP}сум запишется корректировкой`);
    await act(async () => confirm().click());
    await settle();

    expect(apiClient.post).toHaveBeenCalledWith('/moves', { kind: 'adjustment', accountId: 'card', balanceMinor: 320_000_000 });
    expect(dialog()).toBeNull();
    expect(text()).toContain('Остаток сверен');

    await press('Отменить');
    expect(apiClient.delete).toHaveBeenCalledWith('/moves/adj1');
  });

  it('«Изменить» renames with «Отменить»; «Скрыть счёт» hides it and returns to the list', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ success: true, data: CARD } as never);
    await renderAccount();

    await press('Изменить');
    expect(dialog()?.querySelector('h2')?.textContent).toBe('Счёт «Карта»');
    expect(dialog()?.textContent).toContain('Не изменить: на счёте уже есть операции.');
    expect(dialog()?.textContent).toContain(`2${NBSP}000${NBSP}000${NBSP}сум · на 1 августа`);
    expect(dialog()?.textContent).toContain(`Итог уменьшится на 3${NBSP}180${NBSP}000${NBSP}сум.`);

    const input = dialog()!.querySelector<HTMLInputElement>('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Uzcard');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await press('Сохранить');

    expect(apiClient.patch).toHaveBeenCalledWith('/accounts/card', { name: 'Uzcard' });
    expect(text()).toContain('Счёт изменён');
    expect(text()).toContain('Карта → Uzcard');
    await press('Отменить');
    expect(apiClient.patch).toHaveBeenLastCalledWith('/accounts/card', { name: 'Карта' });

    await press('Изменить');
    await press('Скрыть счёт');
    expect(apiClient.patch).toHaveBeenLastCalledWith('/accounts/card', { isHidden: true });
    expect(router.state.location.pathname).toBe('/accounts');
  });

  it('«Скрыть счёт» takes the name typed and not saved along, and «Отменить» brings both back', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ success: true, data: CARD } as never);
    await renderAccount();

    await press('Изменить');
    const input = dialog()!.querySelector<HTMLInputElement>('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Uzcard');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await press('Скрыть счёт');

    expect(apiClient.patch).toHaveBeenLastCalledWith('/accounts/card', { name: 'Uzcard', isHidden: true });
    const toast = useUndoToastStore.getState().stack.at(-1)!;
    expect(toast).toMatchObject({ title: 'Счёт скрыт', detail: 'Uzcard · вернуть — в «Скрытых счетах»' });
    await act(async () => toast.undo!());
    expect(apiClient.patch).toHaveBeenLastCalledWith('/accounts/card', { name: 'Карта', isHidden: false });
  });

  it('a hidden account says so, cannot transfer for that reason, and is shown again with the eye', async () => {
    const hidden = { ...CARD, isHidden: true };
    accounts = { ...accounts, accounts: [CASH, hidden, USD] };
    operations = { ...operations, account: { ...hidden, hasOperations: true } };
    vi.mocked(apiClient.patch).mockResolvedValue({ success: true, data: CARD } as never);
    await renderAccount();

    expect(text()).toContain('сумы · карта · скрыт');
    expect(button('Перевести').getAttribute('aria-disabled')).toBe('true');
    await press('Перевести');
    // Two other accounts are visible: what is missing is this one, not a second account
    expect(router.state.location.pathname).toBe('/accounts/card');
    expect(text()).toContain('Счёт скрыт');
    expect(text()).toContain('Покажите его в «Изменить»');
    expect(text()).not.toContain('Для перевода нужен второй счёт');

    await press('Изменить');
    const show = [...dialog()!.querySelectorAll('button')].find((item) => item.textContent?.trim() === 'Показать счёт')!;
    // The eye, not the crossed-out eye of «Скрыть счёт»
    expect(show.querySelector('circle')).not.toBeNull();
    await act(async () => show.click());
    await settle();
    expect(apiClient.patch).toHaveBeenLastCalledWith('/accounts/card', { isHidden: false });
  });

  it('a guest who follows a link to an account is told accounts come after signing in', async () => {
    useUserStore.setState({ userId: 'guest-1', userType: 'guest', telegramId: null, userName: null });
    await renderAccount();

    expect(text()).toContain('Счета — после входа');
    expect(text()).not.toContain('Загружаем счёт');
    await press('На главную');
  });

  it('with one visible account «Перевести» says a second account is needed', async () => {
    accounts = { ...accounts, accounts: [CARD, { ...CASH, isHidden: true }, { ...USD, isHidden: true }] };
    await renderAccount();

    expect(button('Перевести').getAttribute('aria-disabled')).toBe('true');
    await press('Перевести');
    expect(router.state.location.pathname).toBe('/accounts/card');
    expect(text()).toContain('Для перевода нужен второй счёт');
  });

  it('an account that is not there says so and leads back to the accounts', async () => {
    await renderAccount('nope');

    expect(text()).toContain('Такого счёта нет');
    await press('К счетам');
    expect(router.state.location.pathname).toBe('/accounts');
  });
});
