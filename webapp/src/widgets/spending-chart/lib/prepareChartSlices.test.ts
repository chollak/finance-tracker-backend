import { describe, it, expect } from 'vitest';
import { prepareChartSlices, CHART_SLICE_LIMIT } from './prepareChartSlices';
import { colors } from '@/shared/lib/design-tokens';

const cat = (category: string, total: number, percentage: number) => ({ category, total, percentage });

describe('prepareChartSlices', () => {
  it('keeps every category when they fit inside the palette', () => {
    const slices = prepareChartSlices([
      cat('food', 300, 60),
      cat('transport', 200, 40),
    ]);

    expect(slices).toHaveLength(2);
    expect(slices.map((s) => s.category)).toEqual(['food', 'transport']);
  });

  it('colours slices from the token palette only', () => {
    const slices = prepareChartSlices(
      Array.from({ length: CHART_SLICE_LIMIT }, (_, i) => cat(`c${i}`, 100, 10))
    );

    for (const slice of slices) {
      expect(colors.chart).toContain(slice.fill);
    }
  });

  it('never repeats a colour inside one chart', () => {
    const slices = prepareChartSlices(
      Array.from({ length: 12 }, (_, i) => cat(`c${i}`, 100, 8))
    );

    expect(new Set(slices.map((s) => s.fill)).size).toBe(slices.length);
  });

  it('collapses the tail into one "Другое" slice past the palette limit', () => {
    const slices = prepareChartSlices([
      cat('food', 1000, 50),
      cat('transport', 400, 20),
      cat('utilities', 300, 15),
      cat('entertainment', 100, 5),
      cat('shopping', 90, 4.5),
      cat('health', 60, 3),
      cat('sport', 30, 1.5),
      cat('books', 20, 1),
    ]);

    expect(slices).toHaveLength(CHART_SLICE_LIMIT);

    const last = slices[slices.length - 1];
    expect(last.name).toBe('Другое');
    expect(last.actualValue).toBe(60 + 30 + 20);
    expect(last.percentage).toBeCloseTo(3 + 1.5 + 1, 5);
  });

  it('keeps the collapsed total equal to the original total', () => {
    const input = Array.from({ length: 10 }, (_, i) => cat(`c${i}`, 100, 10));
    const slices = prepareChartSlices(input);

    const before = input.reduce((sum, c) => sum + c.total, 0);
    const after = slices.reduce((sum, s) => sum + s.actualValue, 0);
    expect(after).toBe(before);
  });

  it('gives a tiny slice a visible share without lying about its amount', () => {
    const slices = prepareChartSlices([
      cat('food', 9900, 99),
      cat('gum', 100, 1),
    ]);

    const tiny = slices.find((s) => s.category === 'gum')!;
    expect(tiny.actualValue).toBe(100);
    expect(tiny.percentage).toBe(1);
    expect(tiny.value).toBeGreaterThan(tiny.actualValue);
  });

  it('returns nothing for no categories', () => {
    expect(prepareChartSlices([])).toEqual([]);
    expect(prepareChartSlices(undefined)).toEqual([]);
  });
});
