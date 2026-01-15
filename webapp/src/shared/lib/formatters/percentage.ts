const LOCALE = 'ru-RU';

/**
 * Formats number as percentage
 * @param value - Number to format (0.5 = 50%)
 * @param options - Formatting options
 * @returns Formatted percentage string (e.g., "50%")
 */
export function formatPercentage(
  value: number,
  options: {
    decimals?: number; // Number of decimal places (default: 0)
    showSign?: boolean; // Show + for positive values
    multiply?: boolean; // Multiply by 100 (default: true)
  } = {}
): string {
  const { decimals = 0, showSign = false, multiply = true } = options;

  const percentage = multiply ? value * 100 : value;

  const formatted = new Intl.NumberFormat(LOCALE, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(multiply ? value : value / 100);

  if (showSign && percentage > 0) {
    return `+${formatted}`;
  }

  return formatted;
}

/**
 * Formats budget usage percentage
 * @param spent - Amount spent
 * @param total - Budget total amount
 * @returns Formatted percentage string (e.g., "75%")
 */
export function formatBudgetUsage(spent: number, total: number): string {
  if (total === 0) return '0%';

  const percentage = (spent / total) * 100;
  return `${Math.round(percentage)}%`;
}

/**
 * Formats change percentage with sign
 * @param change - Change value (e.g., 0.15 for +15%)
 * @returns Formatted change with sign (e.g., "+15%")
 */
export function formatChangePercentage(change: number): string {
  return formatPercentage(change, {
    decimals: 1,
    showSign: true
  });
}
