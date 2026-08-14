import { describe, it, expect } from 'vitest';
import {
  shouldShowSemanticBadge,
  isNonExpenseMovement,
  getSemanticTypeLabel,
  NEEDS_REVIEW_CORRECTION_TYPES,
} from './semanticType';
import { TRANSACTION_SEMANTIC_TYPES } from '@/shared/types';

/**
 * A badge earns its place only by saying something the row does not already
 * say. Amount colour and sign already distinguish an expense from income.
 */
describe('shouldShowSemanticBadge', () => {
  it('stays silent for a plain expense', () => {
    expect(shouldShowSemanticBadge('expense')).toBe(false);
  });

  it('stays silent for plain income', () => {
    expect(shouldShowSemanticBadge('income')).toBe(false);
  });

  it('speaks for every movement that is neither', () => {
    for (const type of ['own_transfer', 'saving_deposit', 'debt', 'reimbursement', 'cash_withdrawal', 'group_payment'] as const) {
      expect(shouldShowSemanticBadge(type), type).toBe(true);
    }
  });

  it('agrees with the non-expense rule, so the two cannot drift apart', () => {
    for (const type of TRANSACTION_SEMANTIC_TYPES) {
      expect(shouldShowSemanticBadge(type), type).toBe(isNonExpenseMovement(type));
    }
  });

  it('every badge it shows has a label', () => {
    for (const type of TRANSACTION_SEMANTIC_TYPES) {
      if (shouldShowSemanticBadge(type)) {
        expect(getSemanticTypeLabel(type).length, type).toBeGreaterThan(0);
      }
    }
  });
});

describe('NEEDS_REVIEW_CORRECTION_TYPES', () => {
  it('offers every type a doubtful movement could turn out to be, except income', () => {
    expect(NEEDS_REVIEW_CORRECTION_TYPES).not.toContain('income');
    expect(NEEDS_REVIEW_CORRECTION_TYPES).toContain('expense');
    expect(NEEDS_REVIEW_CORRECTION_TYPES).toContain('own_transfer');
  });
});
