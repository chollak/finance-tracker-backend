// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { settingsKeys, type UserSettings } from '@/entities/settings';
import { useUserStore } from '@/entities/user';
import { ThemeSettingsSync, ThemeSheet, useThemeChoice } from '@/features/theme-choice';
import { apiClient } from '@/shared/api';
import { useThemeStore, type ThemePreference } from '@/shared/lib/theme';
import { useUndoToastStore } from '@/shared/lib/undo';
import { ThemeController } from './ThemeController';

/**
 * FT-125, board «Тема»: the theme changes at once and is the user's setting (`theme` of GET/PATCH /api/settings), so
 * it follows the user to the bot's Mini App on another phone and to the browser. The device keeps the last one only
 * to paint the first frame. Rendered in jsdom with the app's own ThemeController, the API answered here.
 */

vi.mock('@/shared/api/client', () => {
  const pending = () => new Promise<never>(() => {});
  return { apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending) } };
});

const USER_ID = '900000001';

const SETTINGS: UserSettings = {
  userId: 'u1', theme: 'telegram', dailySummaryEnabled: true, dailySummaryTime: '21:00', auditEnabled: true, auditTime: '10:00',
  goalAlertsEnabled: true, fxOwnRateMinor: null, fxOwnSince: null, defaultAccountId: null, onboardedAt: '2026-10-01T09:00:00.000Z',
  receiptTipsSeen: 0, auditInviteSnoozedUntil: null, displayCurrency: 'UZS',
};

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

/** The three choices as buttons, the way «Тема» offers them. */
function Chooser() {
  const { choose } = useThemeChoice();
  return (
    <>
      {(['telegram', 'light', 'dark'] as const).map((preference) => (
        <button key={preference} type="button" data-theme-choice={preference} onClick={() => choose(preference)} />
      ))}
    </>
  );
}

function choose(preference: ThemePreference) {
  document.querySelector<HTMLButtonElement>(`[data-theme-choice="${preference}"]`)!.click();
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mount(settings: UserSettings | null) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (settings) client.setQueryData(settingsKeys.detail(USER_ID), settings);
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <ThemeController />
        <ThemeSettingsSync />
        <Chooser />
      </QueryClientProvider>
    );
  });
  await settle();
}

const shown = () => document.documentElement.dataset.theme;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.mocked(apiClient.get).mockImplementation(() => new Promise<never>(() => {}));
  vi.mocked(apiClient.patch).mockReset();
  useUserStore.setState({ userId: USER_ID, userType: 'telegram', telegramId: USER_ID, userName: 'Шукур' });
  useThemeStore.setState({ preference: 'telegram', resolved: 'light', automatic: 'light' });
  useUndoToastStore.setState({ stack: [], openSheets: 0 });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete document.documentElement.dataset.theme;
  vi.unstubAllGlobals();
});

describe('the theme', () => {
  it('opens as the user chose it, wherever it was chosen: the saved setting wins over the device', async () => {
    useThemeStore.setState({ preference: 'light' });
    await mount({ ...SETTINGS, theme: 'dark' });

    expect(useThemeStore.getState().preference).toBe('dark');
    expect(shown()).toBe('dark');
  });

  it('changes at once and is saved', async () => {
    vi.mocked(apiClient.patch).mockImplementation(() => new Promise<never>(() => {}));
    await mount(SETTINGS);
    expect(shown()).toBe('light');

    await act(async () => choose('dark'));

    // The answer has not come yet: the screen is dark already
    expect(shown()).toBe('dark');
    expect(apiClient.patch).toHaveBeenCalledWith('/settings', { theme: 'dark' });
  });

  it('a save that failed puts the theme back and says so', async () => {
    vi.mocked(apiClient.patch).mockRejectedValue(Object.assign(new Error('offline'), { status: 0 }));
    await mount({ ...SETTINGS, theme: 'light' });

    await act(async () => choose('dark'));
    await settle();

    expect(shown()).toBe('light');
    expect(useThemeStore.getState().preference).toBe('light');
    expect(useUndoToastStore.getState().stack.map((entry) => entry.title)).toEqual(['Не получилось сохранить тему']);
  });

  it('when the settings could not be read, a failed save still puts the theme back', async () => {
    vi.mocked(apiClient.patch).mockRejectedValue(new Error('offline'));
    await mount(null);

    await act(async () => choose('dark'));
    await settle();

    expect(useThemeStore.getState().preference).toBe('telegram');
  });

  it('a guest has no saved settings: the choice stays on this device', async () => {
    useUserStore.setState({ userId: 'guest_1', userType: 'guest', telegramId: null, userName: 'Guest' });
    await mount(null);

    await act(async () => choose('dark'));

    expect(shown()).toBe('dark');
    expect(apiClient.patch).not.toHaveBeenCalled();
  });
});

describe('«Тема» while it is open', () => {
  /** A Mini App whose colorScheme Telegram changes, with the `themeChanged` handlers the app gave it. */
  function telegram(colorScheme: 'light' | 'dark') {
    const handlers: Array<() => void> = [];
    const webApp = {
      initData: 'query_id=1&hash=abc',
      colorScheme,
      onEvent: (event: string, handler: () => void) => event === 'themeChanged' && handlers.push(handler),
      offEvent: vi.fn(),
    };
    vi.stubGlobal('Telegram', { WebApp: webApp });
    return {
      change: (scheme: 'light' | 'dark') => {
        webApp.colorScheme = scheme;
        handlers.forEach((handler) => handler());
      },
    };
  }

  const automaticLine = () =>
    [...document.body.querySelectorAll('[role="radio"]')][0]?.querySelector(':scope > span:first-child > span:last-child')?.textContent;

  async function open() {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(settingsKeys.detail(USER_ID), SETTINGS);
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <ThemeController />
          <ThemeSheet open onOpenChange={() => {}} inTelegram />
        </QueryClientProvider>
      );
    });
    await settle();
  }

  it.each<ThemePreference>(['telegram', 'light'])('names what Telegram has now, as Telegram changes it (chosen: %s)', async (preference) => {
    useThemeStore.setState({ preference });
    const app = telegram('light');
    await open();
    expect(automaticLine()).toBe('Сейчас в Telegram светлая');

    await act(async () => app.change('dark'));

    expect(automaticLine()).toBe('Сейчас в Telegram тёмная');
    // The screen follows Telegram only while the theme is «Как в Telegram»
    expect(shown()).toBe(preference === 'telegram' ? 'dark' : 'light');
  });
});
