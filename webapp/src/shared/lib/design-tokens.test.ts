import { describe, it, expect } from 'vitest';
import { colors, cssVars, getChartColors, getCategoryColorByIndex } from './design-tokens';

// FT-059: the category donut shipped its own 8-color list including red and pink.
// Red means expense/destructive everywhere else in the app and green means income, so
// neither can double as a category identity color; the guideline also caps a category
// breakdown at 6 colors.
describe('category chart palette', () => {
  it('holds exactly six colors', () => {
    expect(colors.chart).toHaveLength(6);
  });

  it('reuses no semantic money color', () => {
    expect(colors.chart).not.toContain(colors.expense);
    expect(colors.chart).not.toContain(colors.income);
    expect(colors.chart).not.toContain(colors.success);
    expect(colors.chart).not.toContain(colors.warning);
  });

  it('avoids the expense-red and income-green hue ranges', () => {
    const hues = colors.chart.map((color) => {
      const match = color.match(/oklch\([\d.]+% ([\d.]+) ([\d.]+)\)/);
      return match ? { chroma: Number(match[1]), hue: Number(match[2]) } : null;
    });

    for (const value of hues) {
      expect(value).not.toBeNull();
      // Neutral grays carry no hue meaning; only saturated colors need checking.
      if (value!.chroma < 0.04) continue;
      expect(value!.hue < 40 || value!.hue > 350).toBe(false); // red / expense
      expect(value!.hue > 120 && value!.hue < 175).toBe(false); // green / income
    }
  });

  it('cycles through the palette instead of running out of colors', () => {
    expect(getCategoryColorByIndex(0)).toBe(colors.chart[0]);
    expect(getCategoryColorByIndex(6)).toBe(colors.chart[0]);
    expect(getCategoryColorByIndex(9)).toBe(colors.chart[3]);
  });

  it('never returns more than the palette holds', () => {
    expect(getChartColors(12)).toHaveLength(6);
  });

  it('keeps every slice visually distinct', () => {
    expect(new Set(colors.chart).size).toBe(colors.chart.length);
  });

  // design-tokens.ts is documented as a JS mirror of globals.css. The donut reads
  // `colors.chart` directly via getCategoryColorByIndex, so the palette above is what
  // actually ships; this only pins the CSS side to the same 6-slot contract so a
  // consumer reaching for `cssVars.chartN` gets a variable that exists.
  it('exposes one CSS variable per palette slot', () => {
    const chartVars = Object.entries(cssVars)
      .filter(([key]) => /^chart\d+$/.test(key))
      .map(([, value]) => value);

    expect(chartVars).toEqual(
      colors.chart.map((_, index) => `var(--color-chart-${index + 1})`),
    );
  });
});
