// Alert System Types
export const AlertType = {
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
  BUDGET_NEAR_LIMIT: 'BUDGET_NEAR_LIMIT',
  UNUSUAL_SPENDING: 'UNUSUAL_SPENDING',
  HIGH_CATEGORY_SPENDING: 'HIGH_CATEGORY_SPENDING',
  LOW_SAVINGS_RATE: 'LOW_SAVINGS_RATE',
  SPENDING_TREND_UP: 'SPENDING_TREND_UP'
} as const;

export type AlertType = typeof AlertType[keyof typeof AlertType];

export const AlertSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
} as const;

export type AlertSeverity = typeof AlertSeverity[keyof typeof AlertSeverity];

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  data?: any;
  timestamp: Date;
  userId: string;
  actionable: boolean;
  suggestions?: string[];
}
