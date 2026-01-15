// Currency formatter for UZS (узбекский сум)
const LOCALE = 'ru-RU';
const CURRENCY = 'UZS';

/**
 * Formats amount in UZS currency
 * @param amount - Number to format
 * @param options - Formatting options
 * @returns Formatted currency string (e.g., "1 000 000 сўм")
 */
export function formatCurrency(
  amount: number,
  options: {
    showSign?: boolean; // Show +/- for income/expense
    compact?: boolean; // Compact notation (1M, 1K)
    decimals?: number; // Number of decimal places (default: 0 for UZS)
  } = {}
): string {
  const { showSign = false, compact = false, decimals = 0 } = options;

  // Handle compact notation
  if (compact) {
    const absAmount = Math.abs(amount);
    if (absAmount >= 1_000_000_000) {
      return `${showSign && amount >= 0 ? '+' : ''}${(amount / 1_000_000_000).toFixed(1)}млрд сўм`;
    }
    if (absAmount >= 1_000_000) {
      return `${showSign && amount >= 0 ? '+' : ''}${(amount / 1_000_000).toFixed(1)}млн сўм`;
    }
    if (absAmount >= 1_000) {
      return `${showSign && amount >= 0 ? '+' : ''}${(amount / 1_000).toFixed(1)}К сўм`;
    }
  }

  const formatted = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);

  if (showSign && amount > 0) {
    return `+${formatted}`;
  }

  return formatted;
}

/**
 * Formats amount with +/- prefix for transaction display
 * @param amount - Transaction amount
 * @param type - Transaction type (income or expense)
 * @returns Formatted amount with sign (e.g., "+50 000 сўм" or "-50 000 сўм")
 */
export function formatTransactionAmount(
  amount: number,
  type: 'income' | 'expense'
): string {
  const absAmount = Math.abs(amount);
  const formatted = formatCurrency(absAmount, { decimals: 0 });

  if (type === 'income') {
    return `+${formatted}`;
  }

  return `-${formatted}`;
}

/**
 * Formats amount without currency symbol (just the number)
 * @param amount - Number to format
 * @returns Formatted number string (e.g., "1 000 000")
 */
export function formatAmount(amount: number): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
