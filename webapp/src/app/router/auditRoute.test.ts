import { describe, expect, it } from 'vitest';
import { matchRoutes } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';
import { parentPath } from '@/shared/lib/navigation';
import { appRoutes } from './appRoutes';

/**
 * FT-132: the audit is a screen of the app, opened from Home (the invitation and «Цели после ревизии»), from «Ещё» and
 * from the month it audits in analytics; «Назад» returns there, and opened directly (the bot's link) — to Home.
 */

describe('/audit', () => {
  it('is a screen of the app', () => {
    expect(ROUTES.AUDIT).toBe('/audit');
    expect(matchRoutes(appRoutes, ROUTES.AUDIT)?.at(-1)?.route.path).toBe(ROUTES.AUDIT);
  });

  it('opened directly, «Назад» leads Home', () => {
    expect(parentPath(ROUTES.AUDIT)).toBe(ROUTES.HOME);
  });
});
