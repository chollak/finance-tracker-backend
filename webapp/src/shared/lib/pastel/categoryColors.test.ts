import { describe, expect, it } from 'vitest';
import { categoryInitial, isPastelColor, pastelBgClass, PASTEL_COLORS } from './categoryColors';

describe('pastel category colours', () => {
  it('has a background class for each of the eight colours', () => {
    expect(PASTEL_COLORS).toHaveLength(8);
    for (const color of PASTEL_COLORS) expect(pastelBgClass[color]).toBe(`bg-pastel-${color}`);
  });

  it('recognises only known colours', () => {
    expect(isPastelColor('mint')).toBe(true);
    expect(isPastelColor('red')).toBe(false);
  });

  it('marks a category by its first letter', () => {
    expect(categoryInitial('кафе')).toBe('К');
    expect(categoryInitial('  «Дом»')).toBe('Д');
    expect(categoryInitial('oʻqish')).toBe('O');
    expect(categoryInitial('')).toBe('·');
  });
});
