import { describe, expect, it } from 'vitest';
import { matchRoutes } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';
import { backStep } from '@/shared/lib/navigation';
import { appRoutes } from './appRoutes';

/**
 * FT-114: a sent phrase opens the review of its records at /review, a nested screen of Home — «Назад»
 * leads back to Home even when the screen was opened directly.
 */

function screenAt(path: string): string | undefined {
  return matchRoutes(appRoutes, path)?.at(-1)?.route.path;
}

describe('the review of a sent phrase', () => {
  it('is its own screen at /review', () => {
    expect(ROUTES.CAPTURE_REVIEW).toBe('/review');
    expect(screenAt(ROUTES.CAPTURE_REVIEW)).toBe('/review');
  });

  it('goes back to Home', () => {
    expect(backStep(ROUTES.CAPTURE_REVIEW, 0)).toEqual({ kind: 'route', to: ROUTES.HOME });
  });
});
