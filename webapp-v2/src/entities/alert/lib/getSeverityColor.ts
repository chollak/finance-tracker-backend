import type { AlertSeverity } from '@/shared/types';

interface SeverityColors {
  text: string;
  bg: string;
  icon: string;
}

/**
 * Gets color classes based on alert severity
 */
export function getSeverityColor(severity: AlertSeverity): SeverityColors {
  const SEVERITY_COLORS: Record<string, SeverityColors> = {
    critical: {
      text: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-900/20',
      icon: '🚨',
    },
    high: {
      text: 'text-orange-600 dark:text-orange-400',
      bg: 'bg-orange-50 dark:bg-orange-900/20',
      icon: '⚠️',
    },
    medium: {
      text: 'text-yellow-600 dark:text-yellow-400',
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      icon: '📢',
    },
    low: {
      text: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      icon: 'ℹ️',
    },
  };

  return (
    SEVERITY_COLORS[severity] ||
    SEVERITY_COLORS.low
  );
}
