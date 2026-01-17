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
 * Uses semantic design tokens
 */
export function getSeverityColor(severity: AlertSeverity): SeverityColors {
  const SEVERITY_COLORS: Record<string, SeverityColors> = {
    critical: {
      text: 'text-expense',
      bg: 'bg-expense-muted',
      iconName: 'AlertCircle',
      iconColor: 'text-expense',
    },
    high: {
      text: 'text-expense',
      bg: 'bg-expense-muted',
      iconName: 'AlertTriangle',
      iconColor: 'text-expense',
    },
    medium: {
      text: 'text-warning',
      bg: 'bg-warning-muted',
      iconName: 'Bell',
      iconColor: 'text-warning',
    },
    low: {
      text: 'text-muted-foreground',
      bg: 'bg-muted',
      iconName: 'Info',
      iconColor: 'text-muted-foreground',
    },
  };

  return (
    SEVERITY_COLORS[severity] ||
    SEVERITY_COLORS.low
  );
}
