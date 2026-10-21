import { describe, expect, it } from 'vitest';
import { matchRoutes } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';
import { parentPath } from '@/shared/lib/navigation';
import { appRoutes } from './appRoutes';

/**
 * FT-127: «Категории» in «Ещё» opens the categories screen (FT-125 left the row inactive). It is a screen of the app,
 * not the catch-all of unknown addresses, and «Назад» of the screen opened directly leads to «Ещё».
 */

function screenAt(path: string): string | undefined {
  return matchRoutes(appRoutes, path)?.at(-1)?.route.path;
}

describe('/more/categories', () => {
  it('is a screen of the app', () => {
    expect(ROUTES.CATEGORIES).toBe('/more/categories');
    expect(screenAt(ROUTES.CATEGORIES)).toBe(ROUTES.CATEGORIES);
    expect(screenAt('/more/no-such-screen')).toBe('*');
  });

  it('opened directly it goes back to «Ещё»', () => {
    expect(parentPath(ROUTES.CATEGORIES)).toBe(ROUTES.MORE);
  });
});
