import { describe, expect, it } from 'vitest';
import { isThemePreference, resolveTheme } from './resolveTheme';

describe('resolveTheme', () => {
  it('follows Telegram by default', () => {
    expect(resolveTheme('telegram', 'dark', false)).toBe('dark');
    expect(resolveTheme('telegram', 'light', true)).toBe('light');
  });

  it('falls back to the system setting outside Telegram', () => {
    expect(resolveTheme('telegram', null, true)).toBe('dark');
    expect(resolveTheme('telegram', undefined, false)).toBe('light');
  });

  it('lets an explicit choice win over Telegram and the system', () => {
    expect(resolveTheme('light', 'dark', true)).toBe('light');
    expect(resolveTheme('dark', 'light', false)).toBe('dark');
  });

  it('recognises only the three preferences', () => {
    expect(isThemePreference('telegram')).toBe(true);
    expect(isThemePreference('system')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });
});
