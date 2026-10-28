import { describe, expect, it } from 'vitest';
import { expiryLine, loginViewAfter } from './webLogin';

/**
 * FT-128, boards «Вход по прямой ссылке», «Вход · ждём подтверждения», «Вход не подтвердили»: what the page shows for
 * each answer about its login, and the line under the waiting screen.
 */

describe('the page after an answer about its login', () => {
  it('pending: waits, with the link to the bot and the end of the link', () => {
    expect(loginViewAfter({ status: 'pending', link: 'https://t.me/KapelkaBot?start=login_abc', expiresAt: '2026-10-14T14:47:00.000Z' })).toEqual({
      view: { kind: 'waiting', link: 'https://t.me/KapelkaBot?start=login_abc', expiresAt: '2026-10-14T14:47:00.000Z' },
    });
  });

  it('confirmed in the bot: takes the session', () => {
    expect(loginViewAfter({ status: 'confirmed' })).toEqual({ view: { kind: 'signing-in' } });
  });

  it('the 5 minutes are over: «Вход не подтвердили»', () => {
    expect(loginViewAfter({ status: 'expired' })).toEqual({ view: { kind: 'expired' } });
  });

  it('«Это не я» in the bot: the start again, and a notice why', () => {
    expect(loginViewAfter({ status: 'rejected' })).toEqual({
      view: { kind: 'start' },
      notice: { title: 'Вход отклонён', detail: 'В Telegram нажали «Это не я»' },
    });
  });

  it('no login: the start', () => {
    expect(loginViewAfter({ status: 'none' })).toEqual({ view: { kind: 'start' } });
  });
});

describe('«Ссылка для входа действует»', () => {
  it('5 minutes, until the time on this device', () => {
    // 19:47 in Tashkent, as on the board
    expect(expiryLine('2026-10-14T14:47:00.000Z', 'Asia/Tashkent')).toBe('5 минут, до 19:47');
    expect(expiryLine('2026-10-14T05:03:00.000Z', 'Asia/Tashkent')).toBe('5 минут, до 10:03');
  });
});
