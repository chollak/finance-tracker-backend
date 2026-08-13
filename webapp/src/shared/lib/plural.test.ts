import { describe, it, expect } from 'vitest';
import { plural, pluralWithCount, PLURALS } from './plural';

describe('plural', () => {
  const forms = ['бюджет', 'бюджета', 'бюджетов'] as const;

  it('uses the singular for one', () => {
    expect(plural(1, forms)).toBe('бюджет');
    expect(plural(21, forms)).toBe('бюджет');
    expect(plural(101, forms)).toBe('бюджет');
  });

  it('uses the few form for two through four', () => {
    for (const n of [2, 3, 4, 22, 33, 104]) {
      expect(plural(n, forms)).toBe('бюджета');
    }
  });

  it('uses the many form for five and above', () => {
    for (const n of [0, 5, 9, 10, 25, 100]) {
      expect(plural(n, forms)).toBe('бюджетов');
    }
  });

  it('handles the teens, where the last digit lies', () => {
    for (const n of [11, 12, 13, 14, 111, 112, 113, 114]) {
      expect(plural(n, forms)).toBe('бюджетов');
    }
  });

  it('ignores the sign', () => {
    expect(plural(-1, forms)).toBe('бюджет');
    expect(plural(-3, forms)).toBe('бюджета');
  });

  it('prefixes the number when asked', () => {
    expect(pluralWithCount(1, forms)).toBe('1 бюджет');
    expect(pluralWithCount(3, forms)).toBe('3 бюджета');
    expect(pluralWithCount(12, forms)).toBe('12 бюджетов');
  });
});

describe('PLURALS', () => {
  it('covers the nouns the interface counts', () => {
    expect(pluralWithCount(1, PLURALS.debt)).toBe('1 долг');
    expect(pluralWithCount(2, PLURALS.debt)).toBe('2 долга');
    expect(pluralWithCount(5, PLURALS.debt)).toBe('5 долгов');

    expect(pluralWithCount(1, PLURALS.transaction)).toBe('1 транзакция');
    expect(pluralWithCount(1, PLURALS.budget)).toBe('1 бюджет');
    expect(pluralWithCount(1, PLURALS.category)).toBe('1 категория');
    expect(pluralWithCount(1, PLURALS.voiceInput)).toBe('1 голосовое сообщение');
  });

  it('gives every noun exactly three forms', () => {
    for (const [name, forms] of Object.entries(PLURALS)) {
      expect(forms, name).toHaveLength(3);
      expect(new Set(forms).size, name).toBeGreaterThan(1);
    }
  });
});
