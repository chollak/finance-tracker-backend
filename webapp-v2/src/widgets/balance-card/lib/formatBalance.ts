import { formatCurrency } from '@/shared/lib/formatters';

/**
 * Format balance for display in BalanceCard
 */
export function formatBalance(amount: number): string {
  return formatCurrency(amount);
}

/**
 * Get dynamic font size based on amount magnitude
 * Prevents overflow for large amounts
 * Uses responsive sizing for mobile-first design
 */
export function getDynamicFontSize(amount: number): string {
  const absAmount = Math.abs(amount);

  if (absAmount >= 100_000_000) return 'text-2xl md:text-3xl'; // 100M+
  if (absAmount >= 10_000_000) return 'text-3xl md:text-4xl';  // 10M+
  if (absAmount >= 1_000_000) return 'text-4xl md:text-5xl';   // 1M+
  return 'text-5xl md:text-6xl'; // < 1M
}

/**
 * Get color class for balance amount
 */
export function getBalanceColor(amount: number): string {
  if (amount > 0) return 'text-green-500';
  if (amount < 0) return 'text-red-500';
  return 'text-muted-foreground';
}
