/**
 * Utility functions for formatting monetary amounts for better readability
 */

export interface FormatOptions {
  showCents?: boolean;
  useAbbreviation?: boolean;
  locale?: string;
}

/**
 * Format money with commas and proper currency symbol
 */
export function formatMoney(amount: number, options: FormatOptions = {}): string {
  const {
    showCents = false,
    useAbbreviation = false,
    locale = 'en-US'
  } = options;

  if (useAbbreviation && Math.abs(amount) >= 1000) {
    return formatWithAbbreviation(amount, showCents);
  }

  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0
  });

  return formatter.format(amount);
}

/**
 * Format large amounts with K, M, B abbreviations
 */
export function formatWithAbbreviation(amount: number, showCents: boolean = false): string {
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (absAmount >= 1_000_000_000) {
    const value = absAmount / 1_000_000_000;
    return `${sign}$${value.toFixed(showCents ? 2 : 1)}B`;
  }
  
  if (absAmount >= 1_000_000) {
    const value = absAmount / 1_000_000;
    return `${sign}$${value.toFixed(showCents ? 2 : 1)}M`;
  }
  
  if (absAmount >= 1_000) {
    const value = absAmount / 1_000;
    return `${sign}$${value.toFixed(showCents ? 1 : 0)}K`;
  }

  return formatMoney(amount, { showCents });
}

/**
 * Format money with commas but no abbreviations (good for detailed views)
 */
export function formatMoneyWithCommas(amount: number, showCents: boolean = false): string {
  return formatMoney(amount, { showCents, useAbbreviation: false });
}

/**
 * Format money with smart abbreviations (good for charts and compact displays)
 */
export function formatMoneyCompact(amount: number): string {
  return formatMoney(amount, { useAbbreviation: true, showCents: false });
}

/**
 * Format money for detailed financial reports (with cents)
 */
export function formatMoneyDetailed(amount: number): string {
  return formatMoney(amount, { showCents: true, useAbbreviation: false });
}

/**
 * Format percentage for financial displays
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format large numbers for readability (non-monetary)
 */
export function formatNumber(num: number, useAbbreviation: boolean = true): string {
  if (!useAbbreviation) {
    return num.toLocaleString();
  }

  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  if (absNum >= 1_000_000_000) {
    return `${sign}${(absNum / 1_000_000_000).toFixed(1)}B`;
  }
  
  if (absNum >= 1_000_000) {
    return `${sign}${(absNum / 1_000_000).toFixed(1)}M`;
  }
  
  if (absNum >= 1_000) {
    return `${sign}${(absNum / 1_000).toFixed(0)}K`;
  }

  return num.toLocaleString();
}