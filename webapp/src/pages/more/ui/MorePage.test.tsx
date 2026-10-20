// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { Account, AccountsOverview } from '@/entities/account';
import { GUEST_CATEGORIES, type Category } from '@/entities/category';
import type { UsdRates } from '@/entities/rate';
import type { UserSettings } from '@/entities/settings';
import { useUserStore } from '@/entities/user';
import { apiClient } from '@/shared/api';
import { NBSP } from '@/shared/lib/money';
import { useThemeStore } from '@/shared/lib/theme';
import { useUndoToastStore } from '@/shared/lib/undo';
import { MorePage } from './MorePage';

/**
 * FT-125, boards «„Ещё“ — разделы и настройки», «Сводка дня в боте», «Тема», «„Ещё“ в браузере», «„Ещё“ · тёмная»:
 * «Деньги», «Бот в Telegram», «Вид», «Данные» (by a direct link also «Аккаунт»); every row says its state; the bot's
 * notices and the theme change at once and are saved in the settings; budgets and debts are not offered (Д2).
 * Rendered in jsdom with the API answered here.
 */

vi.mock('@/shared/api/client', () => {
  const pending = () => new Promise<never>(() => {});
  return { apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending) } };
});

const USER_ID = '900000001';

const account = (overrides: Partial<Account>): Account => ({
  id: 'card', name: 'Карта', kind: 'card', currency: 'UZS', openingBalanceMinor: 0, openingDate: '2026-08-01', isHidden: false, sortOrder: 20, balanceMinor: 0, ...overrides,
});
const ACCOUNTS: AccountsOverview = {
  accounts: [
    account({ id: 'cash', name: 'Наличные', kind: 'cash', sortOrder: 10 }),
    account({ id: 'card' }),
    account({ id: 'usd', name: 'Доллары', kind: 'cash', currency: 'USD', sortOrder: 30 }),
    account({ id: 'old', name: 'Старая карта', isHidden: true, sortOrder: 40 }),
  ],
  totalMinor: 0,
  rate: { rateMinor: 1_265_000, source: 'cbu', date: '2026-10-14' },
  missingRate: false,
};
const RATES: UsdRates = {
  effective: { rateMinor: 1_265_000, source: 'cbu', date: '2026-10-14' },
  cbu: { rateMinor: 1_265_000, date: '2026-10-14', fetchedAt: '2026-10-14T04:00:00.000Z' },
  own: null,
};
const SETTINGS: UserSettings = {
  userId: 'u1', theme: 'telegram', dailySummaryEnabled: true, dailySummaryTime: '21:00', auditEnabled: true, auditTime: '10:00',
  goalAlertsEnabled: true, fxOwnRateMinor: null, fxOwnSince: null, defaultAccountId: null, onboardedAt: '2026-10-01T09:00:00.000Z',
  receiptTipsSeen: 0, auditInviteSnoozedUntil: null, displayCurrency: 'UZS',
};

let settings: UserSettings;
let categories: Category[];
let root: Root;
let container: HTMLDivElement;
let router: ReturnType<typeof createMemoryRouter>;

function telegram(colorScheme: 'light' | 'dark' = 'light') {
  vi.stubGlobal('Telegram', {
    WebApp: {
      initData: 'query_id=1&hash=abc', colorScheme, version: '8.0', isVersionAtLeast: () => true,
      BackButton: { show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn() },
    },
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  settings = SETTINGS;
  categories = GUEST_CATEGORIES;
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url === '/accounts') return { success: true, data: ACCOUNTS } as never;
    if (url === '/rates/usd') return { success: true, data: RATES } as never;
    if (url === '/categories') return { success: true, data: categories } as never;
    if (url === '/settings') return { success: true, data: settings } as never;
    return new Promise<never>(() => {});
  });
  vi.mocked(apiClient.patch).mockReset();
  vi.mocked(apiClient.patch).mockImplementation(async (_url: string, patch: unknown) => {
    settings = { ...settings, ...(patch as Partial<UserSettings>) };
    return { success: true, data: settings } as never;
  });
  useUserStore.setState({ userId: USER_ID, userType: 'telegram', telegramId: USER_ID, userName: 'Шукур' });
  useThemeStore.setState({ preference: 'telegram', resolved: 'light' });
  useUndoToastStore.setState({ stack: [], openSheets: 0 });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderMore() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  router = createMemoryRouter(
    [
      { path: '/more', element: <MorePage /> },
      { path: '/accounts', element: <p>Экран счетов</p> },
    ],
    { initialEntries: ['/more'] }
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

const squash = (value: string | null | undefined) => value?.replace(/[ \t\n\r]+/g, ' ').trim() ?? '';
const text = () => squash(document.body.textContent);
const sheet = () => document.body.querySelector<HTMLElement>('[role="dialog"]');

/** «Деньги», «Бот в Telegram»…: each section's heading and its rows as «title · state». */
function sections() {
  return [...document.body.querySelectorAll('section')].map((section) => ({
    title: squash(section.querySelector('h2')?.textContent),
    rows: [...section.querySelectorAll('[data-settings-row]')].map((row) => squash([...row.querySelectorAll('[data-row-text] > span')].map((part) => part.textContent).join(' · '))),
  }));
}

function row(title: string): HTMLElement {
  const found = [...document.body.querySelectorAll<HTMLElement>('[data-settings-row]')].find((item) => item.querySelector('[data-row-text] > span')?.textContent === title);
  if (!found) throw new Error(`No row «${title}»`);
  return found;
}

async function press(element: Element) {
  await act(async () => (element as HTMLElement).click());
  await settle();
}

/** A choice's name and what it gives: «Светлая», «Всегда светлая». */
const parts = (option: Element) => [...option.querySelectorAll(':scope > span:first-child > span')].map((part) => squash(part.textContent));

function inSheet(name: string): HTMLElement {
  const found = [...sheet()!.querySelectorAll<HTMLElement>('button')].find((item) => item.getAttribute('aria-label') === name || squash(item.textContent) === name || parts(item)[0] === name);
  if (!found) throw new Error(`No «${name}» in the sheet`);
  return found;
}

describe('«Ещё» in Telegram', () => {
  beforeEach(() => telegram());

  it('has «Деньги», «Бот в Telegram», «Вид» and «Данные», each row saying its state', async () => {
    await renderMore();

    expect(document.body.querySelector('h1')?.textContent).toBe('Ещё');
    expect(sections()).toEqual([
      { title: 'Деньги', rows: [`Счета и курс доллара · 3 счёта · курс ЦБ 12${NBSP}650`, 'Категории · 8 для расходов, 8 для доходов', 'Ревизия трат · Скоро: разбор трат прошлого месяца'] },
      {
        title: 'Бот в Telegram',
        rows: ['Сводка дня · Каждый вечер в 21:00', 'Звать на ревизию · 1-го числа в 10:00, за прошлый месяц', 'Цели и подписки · Когда цель близка к лимиту и перед списанием подписки'],
      },
      { title: 'Вид', rows: ['Тема · Как в Telegram'] },
      { title: 'Данные', rows: ['Скачать все записи · Скоро: файл CSV придёт в чат с ботом'] },
    ]);
    expect(text()).toContain('Время — по Ташкенту. Кроме этого бот пишет только в ответ на ваши записи.');
    expect(text()).toContain('Все записи с категориями, счетами и курсом — таблицей CSV, её откроет Excel или Google Таблицы.');
  });

  it('offers no budgets and no debts (Д2): the only section it links to is the accounts', async () => {
    await renderMore();

    const links = [...document.body.querySelectorAll('a')].map((link) => link.getAttribute('href'));
    expect(links).toEqual(['/accounts']);
    expect(text()).not.toMatch(/Бюджет|Долг/);
  });

  it('«Счета и курс доллара» opens the accounts', async () => {
    await renderMore();

    await press(row('Счета и курс доллара'));

    expect(router.state.location.pathname).toBe('/accounts');
  });

  it('a hidden category is not counted; the own rate is named as the user\'s', async () => {
    categories = GUEST_CATEGORIES.map((category) => (category.name === 'Связь' ? { ...category, isHidden: true } : category));
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url === '/accounts') return { success: true, data: ACCOUNTS } as never;
      if (url === '/rates/usd') return { success: true, data: { ...RATES, effective: { rateMinor: 1_270_000, source: 'own', date: '2026-10-15' }, own: { rateMinor: 1_270_000, since: '2026-10-15' } } } as never;
      if (url === '/categories') return { success: true, data: categories } as never;
      if (url === '/settings') return { success: true, data: settings } as never;
      return new Promise<never>(() => {});
    });
    await renderMore();

    expect(sections()[0].rows.slice(0, 2)).toEqual([`Счета и курс доллара · 3 счёта · свой курс 12${NBSP}700`, 'Категории · 7 для расходов, 8 для доходов']);
  });

  it('«Сводка дня»: switch and time apply at once, are saved, and the row says the new state', async () => {
    await renderMore();

    await press(row('Сводка дня'));
    expect(sheet()?.querySelector('h2')?.textContent).toBe('Сводка дня');
    expect(squash(sheet()?.textContent)).toContain('Вечером бот пришлёт, сколько потрачено за день и на что, — одним сообщением с кнопкой «Открыть Daftar».');
    expect(squash(sheet()?.textContent)).toContain('В день без записей сводка спросит, правда ли трат не было, — отдельного напоминания нет.');
    const toggle = sheet()!.querySelector('[role="switch"]')!;
    expect(squash(toggle.textContent)).toBe('Присылать сводку');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    const times = [...sheet()!.querySelectorAll('[role="radio"]')];
    expect(times.map((time) => time.textContent)).toEqual(['20:00', '21:00', '22:00', '23:00']);
    expect(times.find((time) => time.getAttribute('aria-checked') === 'true')?.textContent).toBe('21:00');

    await press(inSheet('22:00'));
    expect(apiClient.patch).toHaveBeenLastCalledWith('/settings', { dailySummaryTime: '22:00' });
    expect(inSheet('22:00').getAttribute('aria-checked')).toBe('true');

    await press(toggle);
    expect(apiClient.patch).toHaveBeenLastCalledWith('/settings', { dailySummaryEnabled: false });
    expect(sheet()!.querySelector('[role="switch"]')!.getAttribute('aria-checked')).toBe('false');
    // Off: no time to choose
    expect(sheet()!.querySelectorAll('[role="radio"]')).toHaveLength(0);

    await press(inSheet('Готово'));
    expect(sheet()).toBeNull();
    expect(sections()[1].rows[0]).toBe('Сводка дня · Выключена');
  });

  it('«Звать на ревизию»: 1-го числа, its own times', async () => {
    await renderMore();

    await press(row('Звать на ревизию'));
    expect(squash(sheet()?.textContent)).toContain('Раз в месяц бот позовёт разобрать траты прошлого месяца: что было нужно, а что лишнее.');
    expect(squash(sheet()!.querySelector('[role="switch"]')?.textContent)).toBe('Звать 1-го числа');
    expect(squash(sheet()?.textContent)).toContain('Во сколько звать');
    expect([...sheet()!.querySelectorAll('[role="radio"]')].map((time) => time.textContent)).toEqual(['09:00', '10:00', '12:00', '19:00']);

    await press(inSheet('19:00'));
    await press(inSheet('Готово'));

    expect(apiClient.patch).toHaveBeenLastCalledWith('/settings', { auditTime: '19:00' });
    expect(sections()[1].rows[1]).toBe('Звать на ревизию · 1-го числа в 19:00, за прошлый месяц');
  });

  it('«Цели и подписки»: a switch without a time', async () => {
    await renderMore();

    await press(row('Цели и подписки'));
    expect(squash(sheet()?.textContent)).toContain('Днём, если трата по цели из ревизии подходит к лимиту, и за день до списания подписки, которую вы решили отменить.');
    expect(sheet()!.querySelectorAll('[role="radio"]')).toHaveLength(0);

    await press(sheet()!.querySelector('[role="switch"]')!);
    await press(inSheet('Закрыть'));

    expect(apiClient.patch).toHaveBeenLastCalledWith('/settings', { goalAlertsEnabled: false });
    expect(sections()[1].rows[2]).toBe('Цели и подписки · Выключено');
  });

  it('a save that failed puts the switch back and says so once the sheet is closed', async () => {
    vi.mocked(apiClient.patch).mockRejectedValue(Object.assign(new Error('offline'), { status: 0 }));
    await renderMore();

    await press(row('Сводка дня'));
    await press(sheet()!.querySelector('[role="switch"]')!);

    expect(sheet()!.querySelector('[role="switch"]')!.getAttribute('aria-checked')).toBe('true');
    expect(useUndoToastStore.getState().stack.map((entry) => entry.title)).toEqual(['Не получилось сохранить настройку']);
  });

  it('«Тема»: three choices, the automatic one saying what Telegram has now; a choice applies at once and is saved', async () => {
    telegram('dark');
    await renderMore();

    await press(row('Тема'));
    expect(sheet()?.querySelector('h2')?.textContent).toBe('Тема');
    const options = [...sheet()!.querySelectorAll('[role="radio"]')].map(parts);
    expect(options).toEqual([
      ['Как в Telegram', 'Сейчас в Telegram тёмная'],
      ['Светлая', 'Всегда светлая'],
      ['Тёмная', 'Всегда тёмная'],
    ]);
    expect(inSheet('Как в Telegram').getAttribute('aria-checked')).toBe('true');

    await press(inSheet('Светлая'));

    expect(useThemeStore.getState().preference).toBe('light');
    expect(apiClient.patch).toHaveBeenLastCalledWith('/settings', { theme: 'light' });
    // The sheet stays: the new theme is right there to look at
    expect(inSheet('Светлая').getAttribute('aria-checked')).toBe('true');
    await press(inSheet('Закрыть'));
    expect(sections()[2].rows).toEqual(['Тема · Светлая']);
  });
});

describe('«Ещё» by a direct link', () => {
  it('adds «Аккаунт» with the name, and the automatic theme is «Как в системе»', async () => {
    await renderMore();

    const titles = sections().map((section) => section.title);
    expect(titles).toEqual(['Деньги', 'Бот в Telegram', 'Вид', 'Данные', 'Аккаунт']);
    expect(sections()[2].rows).toEqual(['Тема · Как в системе']);
    expect(sections()[3].rows).toEqual(['Скачать все записи · Скоро: файл CSV на это устройство']);
    expect(sections()[4].rows).toEqual(['Шукур · Вход через Telegram']);
    // Outside Telegram the screen has its own «Назад»
    expect(document.body.querySelector('button[aria-label="Назад"]')).not.toBeNull();
  });

  it('a guest: the bot\'s notices need an account, the theme still changes on this device', async () => {
    useUserStore.setState({ userId: 'guest_1', userType: 'guest', telegramId: null, userName: 'Guest' });
    await renderMore();

    expect(sections()[1].rows).toEqual([
      'Сводка дня · После входа через Telegram',
      'Звать на ревизию · После входа через Telegram',
      'Цели и подписки · После входа через Telegram',
    ]);
    expect(sections()[4].rows).toEqual(['Гость · Записи только в этом браузере']);
    // Not buttons: nothing to open
    expect(row('Сводка дня').tagName).toBe('DIV');

    await press(row('Тема'));
    await press(inSheet('Тёмная'));
    expect(useThemeStore.getState().preference).toBe('dark');
    expect(apiClient.patch).not.toHaveBeenCalled();
  });
});
