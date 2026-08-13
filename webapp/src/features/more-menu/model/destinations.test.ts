import { describe, it, expect } from 'vitest';
import { MORE_DESTINATIONS, isMoreSectionActive } from './destinations';
import { ROUTES } from '@/shared/lib/constants/routes';

describe('MORE_DESTINATIONS', () => {
  it('lists the secondary sections that live behind the More button', () => {
    expect(MORE_DESTINATIONS.map((d) => d.href)).toEqual([ROUTES.DEBTS, ROUTES.ANALYTICS]);
  });

  it('gives every destination a label and a one-line description', () => {
    for (const destination of MORE_DESTINATIONS) {
      expect(destination.title.length).toBeGreaterThan(0);
      expect(destination.description.length).toBeGreaterThan(0);
    }
  });
});

describe('isMoreSectionActive', () => {
  it.each([ROUTES.DEBTS, ROUTES.ANALYTICS, ROUTES.MORE])(
    'treats %s as part of the More section',
    (pathname) => {
      expect(isMoreSectionActive(pathname)).toBe(true);
    }
  );

  it.each([ROUTES.HOME, ROUTES.TRANSACTIONS, ROUTES.BUDGETS])(
    'leaves %s outside the More section',
    (pathname) => {
      expect(isMoreSectionActive(pathname)).toBe(false);
    }
  );

  it('follows the destination list rather than a hardcoded set', () => {
    for (const destination of MORE_DESTINATIONS) {
      expect(isMoreSectionActive(destination.href)).toBe(true);
    }
  });
});
