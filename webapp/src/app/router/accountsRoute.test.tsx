import { describe, expect, it } from 'vitest';
import { matchRoutes } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';
import { parentPath } from '@/shared/lib/navigation';
import { appRoutes } from './appRoutes';

/**
 * FT-118: «Все счета и курс доллара» on the balance card opens the accounts (FT-111 linked a placeholder), and an
 * account opens its own screen. Both are screens of the app, not the catch-all of unknown addresses, and «Назад»
 * of an account opened directly leads to the accounts.
 */

/** The route that renders an address: the deepest match of the app's route table. */
function screenAt(path: string): string | undefined {
  return matchRoutes(appRoutes, path)?.at(-1)?.route.path;
}

describe('/accounts', () => {
  it('the accounts and an account are screens of the app', () => {
    expect(screenAt(ROUTES.ACCOUNTS)).toBe(ROUTES.ACCOUNTS);
    expect(screenAt(ROUTES.ACCOUNT('3f1c-card'))).toBe('/accounts/:id');
    // The check itself tells them apart from an unknown address
    expect(screenAt('/no-such-screen')).toBe('*');
  });

  it('an account opened directly goes back to the accounts, the accounts to Home', () => {
    expect(ROUTES.ACCOUNT('3f1c-card')).toBe('/accounts/3f1c-card');
    expect(parentPath(ROUTES.ACCOUNT('3f1c-card'))).toBe(ROUTES.ACCOUNTS);
    expect(parentPath(ROUTES.ACCOUNTS)).toBe(ROUTES.HOME);
  });
});

describe('/accounts/transfer (FT-119)', () => {
  it('the transfer form is a screen of its own, not an account named «transfer»', () => {
    expect(ROUTES.TRANSFER()).toBe('/accounts/transfer');
    expect(ROUTES.TRANSFER('3f1c card')).toBe('/accounts/transfer?from=3f1c+card');
    expect(screenAt(ROUTES.TRANSFER())).toBe('/accounts/transfer');
  });

  it('opened directly it goes back to the accounts', () => {
    expect(parentPath(ROUTES.TRANSFER())).toBe(ROUTES.ACCOUNTS);
  });
});
