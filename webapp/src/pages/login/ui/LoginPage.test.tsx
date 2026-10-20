// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUserStore } from '@/entities/user';
import { apiClient } from '@/shared/api';
import { useUndoToastStore } from '@/shared/lib/undo';
import { LOGIN_POLL_MS } from '@/features/web-login';
import { LoginPage } from './LoginPage';

/**
 * FT-128, boards «Вход по прямой ссылке», «Вход · ждём подтверждения», «Вход не подтвердили», «Вход · тёмная»: in a
 * browser without a session the app is this screen. «Войти через Telegram» asks the server for a one-time link,
 * opens the chat with the bot in a new tab and waits: the page asks every few seconds how its login went and opens
 * the app by itself once «Подтвердить» is pressed. After 5 minutes it says the time is out. Rendered in jsdom with
 * the API answered here.
 */

vi.mock('@/shared/api/client', () => {
  const pending = () => new Promise<never>(() => {});
  return { apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending) }, onSessionLost: vi.fn() };
});

const LINK = 'https://t.me/DaftarBot?start=login_Q0oqA7r8XfGqzcC9';
const EXPIRES = '2026-10-14T14:47:00.000Z';
const USER = { telegramId: '597843119', firstName: 'Шукур', username: 'shukur' };

type Status = { status: 'pending'; link: string; expiresAt: string } | { status: 'none' | 'confirmed' | 'rejected' | 'expired' };

/** What GET /api/auth/web-login answers next. */
let status: Status;
let root: Root;
let container: HTMLDivElement;
let tab: { location: { href: string }; close: ReturnType<typeof vi.fn>; opener: unknown };

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  status = { status: 'none' };
  vi.mocked(apiClient.get).mockReset();
  vi.mocked(apiClient.post).mockReset();
  vi.mocked(apiClient.delete).mockReset();
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url === '/auth/web-login') return { success: true, data: status } as never;
    return new Promise<never>(() => {});
  });
  vi.mocked(apiClient.post).mockImplementation(async (url: string) => {
    if (url === '/auth/web-login') {
      status = { status: 'pending', link: LINK, expiresAt: EXPIRES };
      return { success: true, data: status } as never;
    }
    if (url === '/auth/session') return { success: true, data: { user: USER } } as never;
    return new Promise<never>(() => {});
  });
  vi.mocked(apiClient.delete).mockImplementation(async () => {
    status = { status: 'none' };
    return { success: true, data: { status: 'none' } } as never;
  });
  tab = { location: { href: '' }, close: vi.fn(), opener: window };
  vi.spyOn(window, 'open').mockImplementation(() => tab as unknown as Window);
  useUserStore.setState({ userId: null, userName: null, username: null, userType: null, telegramId: null, signedOut: true });
  useUndoToastStore.setState({ stack: [], openSheets: 0 });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function renderLogin() {
  await act(async () => {
    root.render(<LoginPage />);
  });
  await settle();
}

async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const squash = (value: string | null | undefined) => value?.replace(/[ \t\n\r]+/g, ' ').trim() ?? '';
const title = () => squash(document.body.querySelector('h1')?.textContent);
const text = () => squash(document.body.textContent);

function button(name: string): HTMLElement {
  const found = [...document.body.querySelectorAll<HTMLElement>('button, a')].find((item) => squash(item.textContent) === name);
  if (!found) throw new Error(`No «${name}»: ${text()}`);
  return found;
}

async function press(name: string) {
  await act(async () => button(name).click());
  await settle();
}

const toasts = () => useUndoToastStore.getState().stack.map((entry) => [entry.title, entry.detail]);
const localTime = (iso: string) => new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

describe('the login screen', () => {
  it('says what Daftar is, the three steps and why no password is needed', async () => {
    await renderLogin();

    expect(title()).toBe('Траты и доходы — голосом, текстом и фото чека');
    expect(text()).toContain('Daftar живёт в Telegram. Войдите тем же аккаунтом — в браузере будут те же счета и записи, что в боте.');
    expect([...document.body.querySelectorAll('li')].map((item) => [...item.children].map((part) => squash(part.textContent)).join(' '))).toEqual([
      '1 Откроется чат с ботом Daftar',
      '2 Нажмите там «Запустить» и «Подтвердить»',
      '3 Вернитесь сюда — вход завершится сам',
    ]);
    expect(button('Войти через Telegram').tagName).toBe('BUTTON');
    expect(text()).toContain('Пароль не нужен. Daftar видит только ваше имя в Telegram — не чаты и не контакты.');
    // Nothing is started until the button is pressed
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('«Войти через Telegram» opens the chat with the bot in a new tab and waits for «Подтвердить»', async () => {
    await renderLogin();
    await press('Войти через Telegram');

    expect(apiClient.post).toHaveBeenCalledWith('/auth/web-login');
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(tab.location.href).toBe(LINK);
    // The bot's page cannot reach back into this one
    expect(tab.opener).toBeNull();

    expect(title()).toBe('Подтвердите вход в Telegram');
    expect(text()).toContain('В чате с ботом Daftar нажмите «Подтвердить» — вход здесь завершится сам.');
    expect(text()).toContain('Чат не открылся или кнопки нет? Нажмите «Открыть Telegram», а в чате — «Запустить».');
    const card = [...document.body.querySelectorAll('span')].find((part) => part.textContent === 'Ссылка для входа действует')?.parentElement;
    expect([...(card?.children ?? [])].map((part) => part.textContent)).toEqual(['Ссылка для входа действует', `5 минут, до ${localTime(EXPIRES)}`]);
    expect(button('Открыть Telegram').getAttribute('href')).toBe(LINK);
    expect(document.body.querySelector('[role="status"]')?.textContent).toBe('Ждём подтверждения в Telegram');
  });

  it('opens the app by itself once the login is confirmed in the bot', async () => {
    await renderLogin();
    await press('Войти через Telegram');

    await wait(LOGIN_POLL_MS);
    expect(useUserStore.getState().userId).toBeNull();

    status = { status: 'confirmed' };
    await wait(LOGIN_POLL_MS);

    expect(apiClient.post).toHaveBeenLastCalledWith('/auth/session');
    expect(useUserStore.getState()).toMatchObject({ userId: '597843119', userName: 'Шукур', username: 'shukur', signedOut: false });
  });

  it('asks at once when the user comes back to the tab', async () => {
    await renderLogin();
    await press('Войти через Telegram');
    status = { status: 'confirmed' };
    vi.mocked(apiClient.get).mockClear();

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await settle();

    expect(apiClient.get).toHaveBeenCalledWith('/auth/web-login');
    expect(useUserStore.getState().userId).toBe('597843119');
  });

  it('after 5 minutes says «Вход не подтвердили» and starts again from there', async () => {
    await renderLogin();
    await press('Войти через Telegram');

    status = { status: 'expired' };
    await wait(LOGIN_POLL_MS);

    expect(title()).toBe('Вход не подтвердили');
    expect(text()).toContain('Ссылка для входа действует 5 минут, и это время вышло. Нажмите ниже — откроется чат с ботом Daftar, там нажмите «Подтвердить».');
    expect(document.body.querySelector('[role="status"]')?.textContent).toBe('Вход не подтвердили. Можно попробовать снова');

    await press('Войти через Telegram');
    expect(vi.mocked(apiClient.post).mock.calls.filter(([url]) => url === '/auth/web-login')).toHaveLength(2);
    expect(title()).toBe('Подтвердите вход в Telegram');
  });

  it('«Это не я» in the bot: back to the start, saying why', async () => {
    await renderLogin();
    await press('Войти через Telegram');

    status = { status: 'rejected' };
    await wait(LOGIN_POLL_MS);

    expect(title()).toBe('Траты и доходы — голосом, текстом и фото чека');
    expect(toasts()).toEqual([['Вход отклонён', 'В Telegram нажали «Это не я»']]);
    expect(useUserStore.getState().userId).toBeNull();
  });

  it('«Отменить вход» forgets the login and stops asking', async () => {
    await renderLogin();
    await press('Войти через Telegram');

    await press('Отменить вход');

    expect(apiClient.delete).toHaveBeenCalledWith('/auth/web-login');
    expect(title()).toBe('Траты и доходы — голосом, текстом и фото чека');
    vi.mocked(apiClient.get).mockClear();
    await wait(LOGIN_POLL_MS * 3);
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('a reload while waiting goes on waiting for the same login', async () => {
    status = { status: 'pending', link: LINK, expiresAt: EXPIRES };
    await renderLogin();

    expect(title()).toBe('Подтвердите вход в Telegram');
    expect(button('Открыть Telegram').getAttribute('href')).toBe(LINK);
    expect(window.open).not.toHaveBeenCalled();
  });

  it('a start that failed stays on the start, closes the empty tab and says so', async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce({ statusCode: 503, message: 'Signing in through the bot is not available right now' });
    await renderLogin();

    await press('Войти через Telegram');

    expect(title()).toBe('Траты и доходы — голосом, текстом и фото чека');
    expect(tab.close).toHaveBeenCalled();
    expect(toasts()).toEqual([['Вход через Telegram недоступен', 'Попробуйте через несколько минут']]);
  });

  it('a blocked new tab is no failure: the waiting screen has «Открыть Telegram»', async () => {
    vi.mocked(window.open).mockReturnValue(null);
    await renderLogin();

    await press('Войти через Telegram');

    expect(title()).toBe('Подтвердите вход в Telegram');
    expect(button('Открыть Telegram').getAttribute('href')).toBe(LINK);
  });
});
