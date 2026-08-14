import { describe, it, expect } from 'vitest';
import { addTransactionSchema } from './schema';
import { quickAddSchema } from '../../quick-add/model/schema';
import { TRANSACTION_SEMANTIC_TYPES } from '@/shared/types';

/**
 * Guard for product invariant И-5: if the product distinguishes kinds of
 * movement, every entry point can express that distinction. Otherwise half the
 * data is wrong by construction and the user sees badges they cannot set.
 */
describe('И-5: каждая точка ручного ввода умеет задать семантику', () => {
  const base = { amount: 1000, category: 'food', description: 'тест', date: '2026-08-14' };

  it.each([
    ['полная форма', addTransactionSchema],
    ['быстрое добавление', quickAddSchema],
  ])('%s принимает любой семантический тип', (_name, schema) => {
    for (const semanticType of TRANSACTION_SEMANTIC_TYPES) {
      const result = schema.safeParse({ ...base, semanticType });
      expect(result.success, semanticType).toBe(true);
    }
  });

  it.each([
    ['полная форма', addTransactionSchema],
    ['быстрое добавление', quickAddSchema],
  ])('%s не принимает выдуманный тип', (_name, schema) => {
    expect(schema.safeParse({ ...base, semanticType: 'not_a_type' }).success).toBe(false);
  });
});
