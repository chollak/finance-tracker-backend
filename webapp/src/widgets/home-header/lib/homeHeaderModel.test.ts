import { describe, expect, it } from 'vitest';
import { formatHomeHeaderDate, getCaptureChannelStatus } from './homeHeaderModel';

describe('formatHomeHeaderDate', () => {
  it('formats day and weekday in Russian', () => {
    // 2026-09-03 is a Thursday.
    expect(formatHomeHeaderDate(new Date(2026, 8, 3))).toEqual({
      day: '3 сентября',
      weekday: 'четверг',
    });
  });

  it('does not pad the day number', () => {
    expect(formatHomeHeaderDate(new Date(2026, 0, 1)).day).toBe('1 января');
  });
});

describe('getCaptureChannelStatus', () => {
  it('reports the Telegram account when signed in', () => {
    expect(getCaptureChannelStatus('telegram')).toEqual({ label: 'Telegram', tone: 'connected' });
  });

  it('reports guest mode as local', () => {
    expect(getCaptureChannelStatus('guest')).toEqual({ label: 'Гость', tone: 'local' });
  });

  it('reports an unknown state before the store resolves a user', () => {
    expect(getCaptureChannelStatus(null)).toEqual({ label: 'Нет входа', tone: 'unknown' });
  });
});
