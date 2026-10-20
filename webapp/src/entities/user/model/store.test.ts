import { beforeEach, describe, expect, it } from 'vitest';
import { useUserStore, withoutGuest } from './store';

/**
 * FT-128, decision Д4: guest mode in the browser is gone. A browser signs in through the bot and keeps a session; a
 * guest an older version kept in localStorage is nobody now, so the login screen shows instead of a guest's Home.
 */

beforeEach(() => {
  useUserStore.setState({ userId: null, userName: null, username: null, userType: null, telegramId: null, signedOut: false });
});

describe('what an older version kept', () => {
  it('a guest is dropped', () => {
    expect(withoutGuest({ userId: 'guest_7a1c', userName: 'Guest', userType: 'guest', telegramId: null })).toEqual({
      userId: null, userName: null, username: null, userType: null, telegramId: null,
    });
  });

  it('a Telegram account stays', () => {
    expect(withoutGuest({ userId: '597843119', userName: 'Шукур', userType: 'telegram', telegramId: '597843119' })).toEqual({
      userId: '597843119', userName: 'Шукур', username: null, userType: 'telegram', telegramId: '597843119',
    });
  });

  it('nothing kept is nobody', () => {
    expect(withoutGuest(undefined)).toMatchObject({ userId: null, userType: null });
  });
});

describe('signing in and out', () => {
  it('a browser session signs the Telegram account in, with its name and @username', () => {
    useUserStore.getState().setSessionUser({ telegramId: '597843119', firstName: 'Шукур', username: 'shukur' });

    expect(useUserStore.getState()).toMatchObject({
      userId: '597843119', telegramId: '597843119', userName: 'Шукур', username: 'shukur', userType: 'telegram', signedOut: false,
    });
  });

  it('signed out: nobody, and the login screen is due', () => {
    useUserStore.getState().setSessionUser({ telegramId: '597843119', firstName: 'Шукур', username: null });
    useUserStore.getState().setSignedOut();

    expect(useUserStore.getState()).toMatchObject({ userId: null, userType: null, telegramId: null, signedOut: true });
  });
});
