import { afterEach, describe, expect, it, vi } from 'vitest';
import { insideTelegram, telegramColorScheme } from './telegramEnvironment';

/**
 * Inside Telegram or by a direct link (FT-125, board «„Ещё“ в браузере»): the Telegram SDK is loaded in a plain
 * browser too, with empty initData, so only initData tells the two apart.
 */
describe('where the app runs', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('inside Telegram: initData is there, and Telegram says light or dark', () => {
    vi.stubGlobal('window', { Telegram: { WebApp: { initData: 'query_id=1&hash=abc', colorScheme: 'dark' } } });

    expect(insideTelegram()).toBe(true);
    expect(telegramColorScheme()).toBe('dark');
  });

  it('a plain browser with the SDK loaded is not Telegram, and its colorScheme does not count', () => {
    vi.stubGlobal('window', { Telegram: { WebApp: { initData: '', colorScheme: 'light' } } });

    expect(insideTelegram()).toBe(false);
    expect(telegramColorScheme()).toBeNull();
  });

  it('without the SDK, or without a window at all (static render), it is a browser', () => {
    vi.stubGlobal('window', {});
    expect(insideTelegram()).toBe(false);

    vi.stubGlobal('window', undefined);
    expect(insideTelegram()).toBe(false);
    expect(telegramColorScheme()).toBeNull();
  });
});
