import { describe, it, expect } from 'vitest';
import { addTransactionSchema } from './schema';

/**
 * The edit form seeds its fields straight from the API, which returns null for
 * optional columns that were never filled in. The schema has to accept that.
 */
describe('addTransactionSchema optional fields', () => {
  const base = {
    amount: 33000,
    type: 'expense' as const,
    category: 'food',
    description: 'Обед',
    date: '2026-08-13',
  };

  it('accepts a transaction without a merchant', () => {
    const result = addTransactionSchema.safeParse(base);

    expect(result.success).toBe(true);
  });

  it('accepts merchant coming back as null from the API', () => {
    const result = addTransactionSchema.safeParse({ ...base, merchant: null });

    expect(result.success).toBe(true);
  });

  it('still accepts a filled merchant', () => {
    const result = addTransactionSchema.safeParse({ ...base, merchant: 'Корзинка' });

    expect(result.success).toBe(true);
  });

  it('still rejects an empty description', () => {
    const result = addTransactionSchema.safeParse({ ...base, description: '' });

    expect(result.success).toBe(false);
  });
});
