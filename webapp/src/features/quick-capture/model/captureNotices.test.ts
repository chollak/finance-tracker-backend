import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendFailedNotice } from './captureNotices';

/**
 * A phrase the server refused with 401. In a browser the session is over and the login screen opens (FT-128): «Вход —
 * через Telegram». Inside Telegram there is nowhere to sign in — the Mini App's initData is refused (#316), and only
 * opening the Mini App again helps; the app shows «Откройте Kapelka заново» at the same time.
 */
describe('the notice of a phrase refused with 401', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('in a browser: sign in again, through Telegram', () => {
    vi.stubGlobal('window', { Telegram: { WebApp: { initData: '' } } });

    expect(sendFailedNotice({ statusCode: 401 })).toEqual({ title: 'Нужно войти снова', detail: 'Вход — через Telegram, текст останется в поле' });
  });

  it('inside Telegram: open Kapelka again — never «Вход — через Telegram»', () => {
    vi.stubGlobal('window', { Telegram: { WebApp: { initData: 'query_id=1&hash=abc' } } });

    const notice = sendFailedNotice({ statusCode: 401, code: 'INIT_DATA_EXPIRED' });

    expect(notice).toEqual({ title: 'Откройте Kapelka заново', detail: 'Закройте её и откройте снова из чата с ботом' });
    expect(`${notice.title} ${notice.detail}`).not.toMatch(/Вход|войти/);
  });
});
