import { describe, expect, it } from 'vitest';
import { matchRoutes } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';
import { parentPath } from '@/shared/lib/navigation';
import { appRoutes } from './appRoutes';

/**
 * FT-121: Analytics shows a month by category, and a category opens its own screen with the days and the operations.
 * The month and the side (expenses or income) are in the address, so «Назад» from a category returns to the same
 * month; a category opened directly goes back to Analytics.
 */

function screenAt(path: string): string | undefined {
  return matchRoutes(appRoutes, path)?.at(-1)?.route.path;
}

describe('/analytics', () => {
  it('the month and a category are screens of the app', () => {
    expect(screenAt(ROUTES.ANALYTICS)).toBe(ROUTES.ANALYTICS);
    expect(screenAt(ROUTES.ANALYTICS_CATEGORY('3f1c-cafe'))).toBe('/analytics/categories/:id');
  });

  it('the address carries the month and the side; expenses of the current month have none', () => {
    expect(ROUTES.ANALYTICS_VIEW({})).toBe('/analytics');
    expect(ROUTES.ANALYTICS_VIEW({ type: 'expense' })).toBe('/analytics');
    expect(ROUTES.ANALYTICS_VIEW({ month: '2026-09', type: 'income' })).toBe('/analytics?month=2026-09&type=income');
    expect(ROUTES.ANALYTICS_CATEGORY('3f1c cafe', '2026-09')).toBe('/analytics/categories/3f1c%20cafe?month=2026-09');
  });

  it('a category opened directly goes back to Analytics, Analytics to Home', () => {
    expect(parentPath(ROUTES.ANALYTICS_CATEGORY('3f1c-cafe'))).toBe(ROUTES.ANALYTICS);
    expect(parentPath(ROUTES.ANALYTICS)).toBe(ROUTES.HOME);
  });
});
