import { describe, expect, it } from 'vitest';
import { THEME_SAVE_FAILED, themeLabel, themeOptions } from './themeChoice';

/**
 * FT-125, boards «Тема», «„Ещё“ в браузере»: «Как в Telegram» (by a direct link — «Как в системе»), «Светлая»,
 * «Тёмная». The automatic choice says what it gives right now.
 */
describe('the theme row of «Ещё»', () => {
  it('names the choice; the automatic one after where the app runs', () => {
    expect(themeLabel('telegram', true)).toBe('Как в Telegram');
    expect(themeLabel('telegram', false)).toBe('Как в системе');
    expect(themeLabel('light', true)).toBe('Светлая');
    expect(themeLabel('dark', false)).toBe('Тёмная');
  });
});

describe('the theme sheet', () => {
  it('inside Telegram: «Как в Telegram» says what Telegram has now, then always light and always dark', () => {
    expect(themeOptions(true, 'light')).toEqual([
      { value: 'telegram', title: 'Как в Telegram', subtitle: 'Сейчас в Telegram светлая' },
      { value: 'light', title: 'Светлая', subtitle: 'Всегда светлая' },
      { value: 'dark', title: 'Тёмная', subtitle: 'Всегда тёмная' },
    ]);
    expect(themeOptions(true, 'dark')[0].subtitle).toBe('Сейчас в Telegram тёмная');
  });

  it('by a direct link: «Как в системе», «Сейчас тёмная»', () => {
    expect(themeOptions(false, 'dark')[0]).toEqual({ value: 'telegram', title: 'Как в системе', subtitle: 'Сейчас тёмная' });
  });

  it('a save that failed says so', () => {
    expect(THEME_SAVE_FAILED).toEqual({ title: 'Не получилось сохранить тему', detail: 'Проверьте связь и попробуйте ещё раз' });
  });
});
