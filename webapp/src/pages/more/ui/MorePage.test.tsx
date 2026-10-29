// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { Account, AccountsOverview } from '@/entities/account';
import { BOARD_OPEN } from '@/entities/audit/model/fixtures';
import { type Category } from '@/entities/category';
import { STARTER_CATEGORIES } from '@/entities/category/model/fixtures';
import type { UsdRates } from '@/entities/rate';
import type { UserSettings } from '@/entities/settings';
import { useUserStore } from '@/entities/user';
import { EXPORT_DONE_MS, useExportStore } from '@/features/export-records';
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
  return {
    apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending), getFile: vi.fn(pending) },
  };
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
  categories = STARTER_CATEGORIES;
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url === '/accounts') return { success: true, data: ACCOUNTS } as never;
    if (url === '/rates/usd') return { success: true, data: RATES } as never;
    if (url === '/categories') return { success: true, data: categories } as never;
    if (url === '/settings') return { success: true, data: settings } as never;
    if (url === '/audits/current') return { success: true, data: BOARD_OPEN } as never;
    return new Promise<never>(() => {});
  });
  vi.mocked(apiClient.patch).mockReset();
  vi.mocked(apiClient.post).mockReset();
  vi.mocked(apiClient.getFile).mockReset();
  vi.mocked(apiClient.delete).mockReset();
  vi.mocked(apiClient.patch).mockImplementation(async (_url: string, patch: unknown) => {
    settings = { ...settings, ...(patch as Partial<UserSettings>) };
    return { success: true, data: settings } as never;
  });
  useUserStore.setState({ userId: USER_ID, userType: 'telegram', telegramId: USER_ID, userName: 'Шукур', username: null, signedOut: false });
  useThemeStore.setState({ preference: 'telegram', resolved: 'light', automatic: 'light' });
  useUndoToastStore.setState({ stack: [], openSheets: 0 });
  useExportStore.setState({ running: false, doneAt: null });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function renderMore() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  router = createMemoryRouter(
    [
      { path: '/more', element: <MorePage /> },
      { path: '/accounts', element: <p>Экран счетов</p> },
      { path: '/more/categories', element: <p>Экран категорий</p> },
      { path: '/audit', element: <p>Экран ревизии</p> },
      { path: '/', element: <p>Главная</p> },
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
      {
        title: 'Деньги',
        rows: [
          `Счета и курс доллара · 3 счёта · курс ЦБ 12${NBSP}650`,
          'Счёт по умолчанию · Наличные · первый в списке',
          'Категории · 8 для расходов, 8 для доходов',
          'Ревизия трат · Сентябрь · 6 трат на проверку',
        ],
      },
      {
        title: 'Бот в Telegram',
        rows: [
          'Сводка дня · Каждый вечер в 21:00',
          'Звать на ревизию · 1-го числа в 10:00, за прошлый месяц',
          'Цели и подписки · Когда цель близка к лимиту и перед списанием подписки',
        ],
      },
      { title: 'Вид', rows: ['Тема · Как в Telegram'] },
      { title: 'Данные', rows: ['Скачать все записи · Файл CSV придёт в чат с ботом'] },
    ]);
    expect(text()).toContain('Время — по Ташкенту. Кроме этого бот пишет только в ответ на ваши записи.');
    expect(text()).toContain('Все записи с категориями, счетами и курсом — таблицей CSV, её откроет Excel или Google Таблицы.');
  });

  it('offers no budgets and no debts (Д2): the sections it links to are the accounts, the categories and the audit', async () => {
    await renderMore();

    const links = [...document.body.querySelectorAll('a')].map((link) => link.getAttribute('href'));
    expect(links).toEqual(['/accounts', '/more/categories', '/audit']);
    expect(text()).not.toMatch(/Бюджет|Долг/);
  });

  it('«Счета и курс доллара» opens the accounts', async () => {
    await renderMore();

    await press(row('Счета и курс доллара'));

    expect(router.state.location.pathname).toBe('/accounts');
  });

  it('«Ревизия трат» opens the audit (FT-132, board «Ревизия (из „Ещё“)»)', async () => {
    await renderMore();

    await press(row('Ревизия трат'));

    expect(router.state.location.pathname).toBe('/audit');
    expect(text()).toBe('Экран ревизии');
  });

  it('«Категории» opens the categories screen (FT-127)', async () => {
    await renderMore();

    await press(row('Категории'));

    expect(router.state.location.pathname).toBe('/more/categories');
  });

  it('a hidden category is not counted; the own rate is named as the user\'s', async () => {
    categories = STARTER_CATEGORIES.map((category) => (category.name === 'Связь' ? { ...category, isHidden: true } : category));
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url === '/accounts') return { success: true, data: ACCOUNTS } as never;
      if (url === '/rates/usd') return { success: true, data: { ...RATES, effective: { rateMinor: 1_270_000, source: 'own', date: '2026-10-15' }, own: { rateMinor: 1_270_000, since: '2026-10-15' } } } as never;
      if (url === '/categories') return { success: true, data: categories } as never;
      if (url === '/settings') return { success: true, data: settings } as never;
      return new Promise<never>(() => {});
    });
    await renderMore();

    expect(sections()[0].rows[0]).toBe(`Счета и курс доллара · 3 счёта · свой курс 12${NBSP}700`);
    expect(sections()[0].rows[2]).toBe('Категории · 7 для расходов, 8 для доходов');
  });

  it('«Сводка дня»: switch and time apply at once, are saved, and the row says the new state', async () => {
    await renderMore();

    await press(row('Сводка дня'));
    expect(sheet()?.querySelector('h2')?.textContent).toBe('Сводка дня');
    expect(squash(sheet()?.textContent)).toContain(`Вечером бот пришлёт, сколько потрачено за день и на что, — одним сообщением с кнопкой «Открыть${NBSP}Kapelka».`);
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
    // The bot calls since FT-133: nothing about «скоро»
    expect(squash(sheet()?.textContent)).not.toContain('скоро');
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
    expect(squash(sheet()?.textContent)).not.toContain('скоро');
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
    // What ThemeController (not mounted here) keeps from Telegram's colorScheme
    useThemeStore.setState({ resolved: 'dark', automatic: 'dark' });
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

  describe('«Счёт по умолчанию» (FT-149; SettingsList.md, Picker.md)', () => {
    const defaultRow = () => row('Счёт по умолчанию');
    const defaultState = () => sections()[0].rows[1];
    const choices = () => [...sheet()!.querySelectorAll('[role="radio"]')].map((option) => parts(option));
    const checked = () => parts(sheet()!.querySelector('[role="radio"][aria-checked="true"]')!)[0];
    const toasts = () => useUndoToastStore.getState().stack.map((entry) => [entry.title, entry.detail]);
    const NOTE = 'Сюда пойдут новые записи, если в них не назван другой счёт или валюта: «нал», «картой», «55$».';

    it('sits under the accounts and opens a sheet, as a row with a chevron does', async () => {
      await renderMore();

      expect(defaultRow().tagName).toBe('BUTTON');
      expect(defaultRow().getAttribute('aria-haspopup')).toBe('dialog');
      expect(defaultState()).toBe('Счёт по умолчанию · Наличные · первый в списке');
    });

    it('offers the visible accounts with their balance, the one records go to now checked; a hidden account is not offered', async () => {
      await renderMore();

      await press(defaultRow());

      expect(sheet()?.querySelector('h2')?.textContent).toBe('Счёт по умолчанию');
      expect(choices()).toEqual([
        ['Наличные', `0${NBSP}сум`],
        ['Карта', `0${NBSP}сум`],
        ['Доллары', `0,00${NBSP}USD`],
      ]);
      expect(squash(sheet()?.textContent)).not.toContain('Старая карта');
      expect(checked()).toBe('Наличные');
      expect(squash(sheet()?.textContent)).toContain(NOTE);
    });

    it('a choice is saved with PATCH /api/settings, closes the sheet and shows in the row before the answer', async () => {
      vi.mocked(apiClient.patch).mockImplementation(() => new Promise<never>(() => {}));
      await renderMore();

      await press(defaultRow());
      await press(inSheet('Карта'));

      expect(apiClient.patch).toHaveBeenCalledTimes(1);
      expect(apiClient.patch).toHaveBeenCalledWith('/settings', { defaultAccountId: 'card' });
      expect(sheet()).toBeNull();
      expect(defaultState()).toBe('Счёт по умолчанию · Карта');
    });

    it('the choice stays after the answer, and the sheet checks it next time', async () => {
      await renderMore();

      await press(defaultRow());
      await press(inSheet('Доллары'));
      expect(defaultState()).toBe('Счёт по умолчанию · Доллары');

      await press(defaultRow());
      expect(checked()).toBe('Доллары');
    });

    it('pressing the account already chosen saves nothing', async () => {
      settings = { ...SETTINGS, defaultAccountId: 'card' };
      await renderMore();

      expect(defaultState()).toBe('Счёт по умолчанию · Карта');
      await press(defaultRow());
      await press(inSheet('Карта'));

      expect(apiClient.patch).not.toHaveBeenCalled();
      expect(sheet()).toBeNull();
    });

    it('a choice that was not saved puts the row back and says so', async () => {
      vi.mocked(apiClient.patch).mockRejectedValue({ statusCode: 0, message: 'Network error' });
      await renderMore();

      await press(defaultRow());
      await press(inSheet('Карта'));

      expect(defaultState()).toBe('Счёт по умолчанию · Наличные · первый в списке');
      expect(toasts()).toEqual([['Не получилось сменить счёт', 'Проверьте связь и попробуйте ещё раз']]);
    });

    it('when the chosen account is hidden, the row and the sheet say records go to the first visible one', async () => {
      settings = { ...SETTINGS, defaultAccountId: 'old' };
      await renderMore();

      expect(defaultState()).toBe('Счёт по умолчанию · Наличные · счёт «Старая карта» скрыт');
      await press(defaultRow());

      expect(checked()).toBe('Наличные');
      expect(squash(sheet()?.textContent)).toContain('Счёт «Старая карта» скрыт — записи идут на первый в списке, «Наличные».');
      expect(choices().map(([name]) => name)).toEqual(['Наличные', 'Карта', 'Доллары']);

      // Choosing the first one makes it the default for good: a new order of accounts no longer moves it
      await press(inSheet('Наличные'));
      expect(apiClient.patch).toHaveBeenCalledWith('/settings', { defaultAccountId: 'cash' });
      expect(defaultState()).toBe('Счёт по умолчанию · Наличные');
    });

    it('settings that did not load: the row says so and a press reads them again', async () => {
      let failed = true;
      vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
        if (url === '/accounts') return { success: true, data: ACCOUNTS } as never;
        if (url === '/settings') {
          if (failed) throw { statusCode: 500, message: 'Server error' };
          return { success: true, data: settings } as never;
        }
        return new Promise<never>(() => {});
      });
      await renderMore();

      expect(defaultState()).toBe('Счёт по умолчанию · Не загрузилось. Нажмите, чтобы повторить');
      failed = false;
      await press(defaultRow());

      expect(defaultState()).toBe('Счёт по умолчанию · Наличные · первый в списке');
    });
  });

  describe('«Скачать все записи» (FT-126, board «Выгрузка записей»)', () => {
    const SENT = { success: true, data: { fileName: 'kapelka-2026-10-14.csv', count: 205 } };
    const exportRow = () => row('Скачать все записи');
    const exportState = () => squash([...exportRow().querySelectorAll('[data-row-text] > span')].map((part) => part.textContent).join(' · '));
    const toasts = () => useUndoToastStore.getState().stack.map((entry) => [entry.title, entry.detail]);
    const chatCalls = () => vi.mocked(apiClient.post).mock.calls.filter(([url]) => url === '/export/chat').length;

    it('an action in place, not a section: no chevron, no sheet', async () => {
      await renderMore();

      expect(exportRow().tagName).toBe('BUTTON');
      expect(exportRow().getAttribute('aria-haspopup')).toBeNull();
      expect(exportRow().querySelectorAll('svg')).toHaveLength(1); // the icon only
    });

    it('sends the file to the chat with the bot once: a second press while it is made, or while its toast shows, sends nothing', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      let answer!: (value: unknown) => void;
      vi.mocked(apiClient.post).mockImplementation((url: string) => (url === '/export/chat' ? new Promise((resolve) => (answer = resolve)) : new Promise<never>(() => {})) as never);
      await renderMore();

      await press(exportRow());
      expect(apiClient.post).toHaveBeenCalledWith('/export/chat');
      expect(exportState()).toBe('Скачать все записи · Готовим файл…');
      expect(exportRow().getAttribute('aria-busy')).toBe('true');
      await press(exportRow());
      expect(chatCalls()).toBe(1);

      await act(async () => answer(SENT));
      await settle();

      expect(toasts()).toEqual([['Файл отправлен в чат с ботом', 'kapelka-2026-10-14.csv · 205 записей']]);
      expect(document.body.querySelector('[role="status"]')?.textContent).toContain('Файл отправлен в чат с ботом');
      expect(exportState()).toBe('Скачать все записи · Отправлено — файл уже в чате с ботом');
      expect(exportRow().getAttribute('aria-disabled')).toBe('true');
      await press(exportRow());
      expect(chatCalls()).toBe(1);

      // The toast is gone: the row is ready, and a press makes a new file
      await act(async () => {
        vi.advanceTimersByTime(EXPORT_DONE_MS + 50);
      });
      expect(exportState()).toBe('Скачать все записи · Файл CSV придёт в чат с ботом');
      expect(exportRow().getAttribute('aria-disabled')).toBeNull();
      await press(exportRow());
      expect(chatCalls()).toBe(2);
    });

    it('a failure says so and the row is ready again', async () => {
      vi.mocked(apiClient.post).mockRejectedValueOnce({ message: 'Network error', statusCode: 0 });
      await renderMore();

      await press(exportRow());

      expect(toasts()).toEqual([['Не получилось отправить файл', 'Проверьте связь и попробуйте ещё раз']]);
      expect(exportState()).toBe('Скачать все записи · Файл CSV придёт в чат с ботом');
      vi.mocked(apiClient.post).mockResolvedValueOnce(SENT as never);
      await press(exportRow());
      expect(chatCalls()).toBe(2);
    });

    it('when the bot may not write to the user, says how to let it', async () => {
      vi.mocked(apiClient.post).mockRejectedValueOnce({ message: 'Request failed', statusCode: 422, code: 'BOT_CHAT_CLOSED' });
      await renderMore();

      await press(exportRow());

      expect(toasts()).toEqual([['Бот не может написать вам', 'Откройте чат с ботом и нажмите «Старт»']]);
    });

    it('with nothing recorded, says there is nothing to send', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({ success: true, data: { fileName: 'kapelka-2026-10-14.csv', count: 0 } } as never);
      await renderMore();

      await press(exportRow());

      expect(toasts()).toEqual([['Выгружать пока нечего', 'Записей ещё нет']]);
      expect(exportState()).toBe('Скачать все записи · Файл CSV придёт в чат с ботом');
    });
  });
});

describe('«Ещё» by a direct link', () => {
  it('adds «Аккаунт» with the name and «Выйти», and the automatic theme is «Как в системе»', async () => {
    await renderMore();

    const titles = sections().map((section) => section.title);
    expect(titles).toEqual(['Деньги', 'Бот в Telegram', 'Вид', 'Данные', 'Аккаунт']);
    expect(sections()[2].rows).toEqual(['Тема · Как в системе']);
    expect(sections()[3].rows).toEqual(['Скачать все записи · Файл CSV на это устройство']);
    expect(sections()[4].rows).toEqual(['Шукур · Вход через Telegram', 'Выйти · Только в этом браузере · записи останутся']);
    // Outside Telegram the screen has its own «Назад»
    expect(document.body.querySelector('button[aria-label="Назад"]')).not.toBeNull();
  });

  it('the header with «Назад» stays while the list scrolls under it (board: the header is fixed)', async () => {
    await renderMore();

    const pinned = document.body.querySelector('button[aria-label="Назад"]')?.closest('.sticky');
    expect(pinned?.className.split(' ')).toEqual(expect.arrayContaining(['sticky', 'top-0', 'bg-bg']));
    expect(pinned?.querySelector('h1')?.textContent).toBe('Ещё');
    // The sections are not inside it: they scroll
    expect(pinned?.querySelector('section')).toBeNull();
  });

  it('«Скачать все записи» downloads the file to the device, never through the chat', async () => {
    vi.mocked(apiClient.getFile).mockResolvedValue({
      blob: new Blob(['\uFEFFДата;Тип'], { type: 'text/csv' }),
      headers: new Headers({ 'Content-Disposition': 'attachment; filename="kapelka-2026-10-14.csv"', 'X-Export-Count': '205' }),
    } as never);
    // jsdom has no object URLs
    const createObjectURL = vi.fn(() => 'blob:kapelka');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const saved: Array<{ href: string; download: string }> = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ href: this.href, download: this.download });
    });
    await renderMore();

    await press(row('Скачать все записи'));

    expect(apiClient.getFile).toHaveBeenCalledWith('/export');
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(saved).toEqual([{ href: 'blob:kapelka', download: 'kapelka-2026-10-14.csv' }]);
    expect(useUndoToastStore.getState().stack.map((entry) => [entry.title, entry.detail])).toEqual([['Файл скачан', 'kapelka-2026-10-14.csv · 205 записей']]);
    expect(sections()[3].rows).toEqual(['Скачать все записи · Скачано — файл в загрузках']);
  });

  it('«Аккаунт» names the account as the board does: «@shukur · вход через Telegram»', async () => {
    useUserStore.setState({ username: 'shukur' });
    await renderMore();

    expect(sections()[4].rows[0]).toBe('Шукур · @shukur · вход через Telegram');
    // Who is signed in is a fact, not a button
    expect(row('Шукур').tagName).toBe('DIV');
  });

  it('«Выйти» ends the session in this browser only and leaves for the login screen', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ success: true, data: { signedOut: true } } as never);
    // The service worker's API answers: routes such as /api/accounts don't name the user
    const forget = vi.fn(async () => {
      expect(useUserStore.getState().userId).toBe(USER_ID);
      return true;
    });
    vi.stubGlobal('caches', { delete: forget });
    await renderMore();

    // An action in place: no chevron, no sheet
    expect(row('Выйти').tagName).toBe('BUTTON');
    expect(row('Выйти').getAttribute('aria-haspopup')).toBeNull();
    expect(row('Выйти').querySelectorAll('svg')).toHaveLength(1); // the icon only
    await press(row('Выйти'));

    expect(apiClient.delete).toHaveBeenCalledWith('/auth/session');
    // Forgotten before the login screen, so the next account in this browser never gets them
    expect(forget).toHaveBeenCalledWith('api-cache');
    expect(useUserStore.getState()).toMatchObject({ userId: null, signedOut: true });
    // The next sign-in opens Home, as on the board
    expect(router.state.location.pathname).toBe('/');
  });

  it('«Выйти» that did not reach the server keeps the user in and says so', async () => {
    vi.mocked(apiClient.delete).mockRejectedValue({ statusCode: 0, message: 'Network error' });
    const forget = vi.fn(async () => true);
    vi.stubGlobal('caches', { delete: forget });
    await renderMore();

    await press(row('Выйти'));
    expect(forget).not.toHaveBeenCalled();

    expect(useUserStore.getState()).toMatchObject({ userId: USER_ID, signedOut: false });
    expect(useUndoToastStore.getState().stack.map((entry) => [entry.title, entry.detail])).toEqual([['Не получилось выйти', 'Проверьте связь и попробуйте ещё раз']]);
  });
});
