import { colors } from '@/shared/lib/design-tokens';
import { getCategoryName } from '@/entities/category';

/** The token palette holds six colours; a chart never shows more slices than that. */
export const CHART_SLICE_LIMIT = colors.chart.length;

/** A slice smaller than this is still drawn this wide, or it disappears. */
const MIN_VISUAL_PERCENT = 5;

export interface CategoryBreakdownEntry {
  category: string;
  total: number;
  percentage: number;
}

export interface ChartSlice {
  category: string;
  name: string;
  /** Drawing size — inflated for tiny slices so they stay visible. */
  value: number;
  /** The real amount, used for every number shown to the user. */
  actualValue: number;
  percentage: number;
  fill: string;
}

/**
 * Turns a category breakdown into chart slices.
 *
 * Everything past the palette limit is collapsed into a single "Другое" slice
 * rather than cycling colours, so one colour always means one category.
 */
export function prepareChartSlices(
  categories: CategoryBreakdownEntry[] | undefined
): ChartSlice[] {
  if (!categories?.length) return [];

  const sorted = [...categories].sort((a, b) => b.total - a.total);

  let head = sorted;
  let tail: CategoryBreakdownEntry[] = [];

  if (sorted.length > CHART_SLICE_LIMIT) {
    head = sorted.slice(0, CHART_SLICE_LIMIT - 1);
    tail = sorted.slice(CHART_SLICE_LIMIT - 1);
  }

  const entries: CategoryBreakdownEntry[] = tail.length
    ? [
        ...head,
        {
          category: 'other',
          total: tail.reduce((sum, item) => sum + item.total, 0),
          percentage: tail.reduce((sum, item) => sum + item.percentage, 0),
        },
      ]
    : head;

  const totalValue = entries.reduce((sum, entry) => sum + entry.total, 0);

  return entries.map((entry, index) => {
    const visualPercent = Math.max(entry.percentage, MIN_VISUAL_PERCENT);

    return {
      category: entry.category,
      name: tail.length && index === entries.length - 1
        ? 'Другое'
        : getCategoryName(entry.category),
      value: (visualPercent / 100) * totalValue,
      actualValue: entry.total,
      percentage: entry.percentage,
      fill: colors.chart[index],
    };
  });
}
