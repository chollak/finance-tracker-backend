import type { AlertSeverity } from '@/shared/types';

type LucideIconName = 'AlertCircle' | 'AlertTriangle' | 'Bell' | 'Info';

interface SeverityColors {
  text: string;
  bg: string;
  iconName: LucideIconName;
  iconColor: string;
}

/**
 * Gets color classes and icon based on alert severity
 */
export function getSeverityColor(severity: AlertSeverity): SeverityColors {
  const SEVERITY_COLORS: Record<string, SeverityColors> = {
    critical: {
      text: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-900/20',
      iconName: 'AlertCircle',
      iconColor: 'text-red-600 dark:text-red-400',
    },
    high: {
      text: 'text-orange-600 dark:text-orange-400',
      bg: 'bg-orange-50 dark:bg-orange-900/20',
      iconName: 'AlertTriangle',
      iconColor: 'text-orange-600 dark:text-orange-400',
    },
    medium: {
      text: 'text-yellow-600 dark:text-yellow-400',
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      iconName: 'Bell',
      iconColor: 'text-yellow-600 dark:text-yellow-400',
    },
    low: {
      text: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      iconName: 'Info',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
  };

  return (
    SEVERITY_COLORS[severity] ||
    SEVERITY_COLORS.low
  );
}
