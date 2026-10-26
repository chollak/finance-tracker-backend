import { describe, expect, it } from 'vitest';
import { transactionToViewModel } from './toViewModel';

describe('transactionToViewModel category mark (FT-100)', () => {
  const base = {
    date: '2026-10-16',
    description: 'Капучино',
    amount: 25000,
    type: 'expense' as const,
    userId: 'u',
  };

  it('marks the category with its first letter on its pastel colour', () => {
    const vm = transactionToViewModel({ ...base, category: 'Кафе', categoryId: 'c1', categoryColor: 'rose' });
    expect(vm._categoryIcon).toBe('К');
    expect(vm._categoryColor).toBe('bg-pastel-rose text-pastel-ink');
  });

  it('falls back to mist for a record without a known colour', () => {
    const vm = transactionToViewModel({ ...base, category: 'еда' });
    expect(vm._categoryIcon).toBe('Е');
    expect(vm._categoryColor).toBe('bg-pastel-mist text-pastel-ink');
  });
});
