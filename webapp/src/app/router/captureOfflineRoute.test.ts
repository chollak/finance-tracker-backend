import { describe, expect, it } from 'vitest';
import { matchRoutes } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';
import { parentPath } from '@/shared/lib/navigation';
import { appRoutes } from './appRoutes';

/**
 * FT-129, boards «Голос без связи» and «Чек без связи»: the honest screens of voice and receipts without a connection
 * are app screens of their own, and «Назад» from them is Home.
 */

const screenAt = (path: string) => matchRoutes(appRoutes, path)?.at(-1)?.route.path;

describe('the offline screens of voice and receipts', () => {
  it('have their own addresses', () => {
    expect(screenAt(ROUTES.VOICE_OFFLINE)).toBe(ROUTES.VOICE_OFFLINE);
    expect(screenAt(ROUTES.RECEIPT_OFFLINE)).toBe(ROUTES.RECEIPT_OFFLINE);
  });

  it('return to Home', () => {
    expect(parentPath(ROUTES.VOICE_OFFLINE)).toBe(ROUTES.HOME);
    expect(parentPath(ROUTES.RECEIPT_OFFLINE)).toBe(ROUTES.HOME);
  });
});
