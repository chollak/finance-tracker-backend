import { appConfigWith } from './helpers/appConfigWith';

/**
 * FT-167: in production an empty TG_BOT_API_KEY with polling on left the bot `disabled` and /api/health at 200 — the
 * live instance answered the web while the bot said nothing, and systemd saw nothing wrong. Now the start stops with
 * a configuration error. Polling switched off (`ENABLE_TELEGRAM_POLLING=false`, the `api` preview and the live instance
 * before the move) still starts without a token, and so does anything outside production.
 */
describe('TG_BOT_API_KEY in AppConfig (FT-167)', () => {
  const production = { NODE_ENV: 'production', ALLOWED_TELEGRAM_IDS: '597843119' };

  it('in production with polling on, an empty token stops the start and says how to go without the bot', () => {
    for (const TG_BOT_API_KEY of ['', '   ']) {
      const { isValid, errors } = appConfigWith({ ...production, TG_BOT_API_KEY, ENABLE_TELEGRAM_POLLING: 'true' }).validate();
      expect(isValid).toBe(false);
      expect(errors).toEqual([expect.stringMatching(/TG_BOT_API_KEY is required in production.*ENABLE_TELEGRAM_POLLING=false/)]);
    }
  });

  it('polling is on unless switched off, so an unset ENABLE_TELEGRAM_POLLING counts as on', () => {
    const { isValid } = appConfigWith({ ...production, TG_BOT_API_KEY: '', ENABLE_TELEGRAM_POLLING: '' }).validate();
    expect(isValid).toBe(false);
  });

  it('in production with polling switched off, the start goes on without a token', () => {
    expect(appConfigWith({ ...production, TG_BOT_API_KEY: '', ENABLE_TELEGRAM_POLLING: 'false' }).validate())
      .toEqual({ isValid: true, errors: [] });
  });

  it('in production with a token, the start goes on', () => {
    expect(appConfigWith({ ...production, TG_BOT_API_KEY: '123:token', ENABLE_TELEGRAM_POLLING: 'true' }).validate())
      .toEqual({ isValid: true, errors: [] });
  });

  it('outside production an empty token still only disables the bot, as before', () => {
    for (const NODE_ENV of ['development', 'test']) {
      expect(appConfigWith({ NODE_ENV, TG_BOT_API_KEY: '', ENABLE_TELEGRAM_POLLING: 'true' }).validate())
        .toEqual({ isValid: true, errors: [] });
    }
  });
});
