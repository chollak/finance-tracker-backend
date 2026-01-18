/**
 * Design Tokens for Finance Tracker
 *
 * TypeScript constants for programmatic use (charts, dynamic styles).
 * CSS variables are defined in globals.css - this file mirrors them for JS usage.
 *
 * Design System: Minimal & Clean | Inter | Green Accent
 */

/**
 * Color tokens for charts and programmatic styling
 * Values match CSS variables in globals.css
 */
export const colors = {
  // Semantic finance colors (light mode values)
  income: 'oklch(55% 0.2 145)',
  expense: 'oklch(55% 0.22 25)',
  warning: 'oklch(65% 0.18 55)',
  success: 'oklch(55% 0.2 145)',

  // Chart palette (6 colors for pie charts, etc.)
  chart: [
    'oklch(55% 0.2 145)',   // Green (income/primary)
    'oklch(55% 0.15 250)',  // Blue
    'oklch(55% 0.15 320)',  // Purple
    'oklch(65% 0.15 55)',   // Orange
    'oklch(55% 0.15 195)',  // Teal
    'oklch(55% 0.22 25)',   // Red (expense)
  ],

  // Neutral palette
  background: 'oklch(100% 0 0)',
  foreground: 'oklch(9.6% 0 0)',
  muted: 'oklch(95.3% 0 0)',
  border: 'oklch(88.1% 0 0)',
} as const;

/**
 * CSS variable getters for use in inline styles
 */
export const cssVars = {
  // Colors
  income: 'var(--color-income)',
  incomeMuted: 'var(--color-income-muted)',
  expense: 'var(--color-expense)',
  expenseMuted: 'var(--color-expense-muted)',
  warning: 'var(--color-warning)',
  warningMuted: 'var(--color-warning-muted)',
  success: 'var(--color-success)',
  successMuted: 'var(--color-success-muted)',

  // Base
  background: 'var(--color-background)',
  foreground: 'var(--color-foreground)',
  card: 'var(--color-card)',
  cardForeground: 'var(--color-card-foreground)',
  primary: 'var(--color-primary)',
  primaryForeground: 'var(--color-primary-foreground)',
  muted: 'var(--color-muted)',
  mutedForeground: 'var(--color-muted-foreground)',
  border: 'var(--color-border)',

  // Chart colors
  chart1: 'var(--color-chart-1)',
  chart2: 'var(--color-chart-2)',
  chart3: 'var(--color-chart-3)',
  chart4: 'var(--color-chart-4)',
  chart5: 'var(--color-chart-5)',
  chart6: 'var(--color-chart-6)',
} as const;

/**
 * Border radius scale (matches CSS variables)
 */
export const radius = {
  sm: '0.5rem',    // 8px - Badges, chips
  md: '0.75rem',   // 12px - Buttons, inputs
  lg: '1rem',      // 16px - Small cards
  xl: '1.25rem',   // 20px - Standard cards
  '2xl': '1.5rem', // 24px - Large cards
  '3xl': '2rem',   // 32px - Modals
  full: '9999px',  // Pills, avatars
} as const;

/**
 * Animation timing (matches CSS variables)
 */
export const animation = {
  duration: {
    fast: 150,     // Hover states
    normal: 300,   // Page transitions, fade-in
    slow: 400,     // Modal appearance
    stagger: 50,   // List item delay increment
  },
  easing: {
    out: 'cubic-bezier(0.16, 1, 0.3, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
} as const;

/**
 * Spacing constants
 */
export const spacing = {
  touchTarget: 44,    // Minimum touch target (px)
  touchTargetLg: 48,  // Preferred touch target (px)
} as const;

/**
 * Typography
 */
export const typography = {
  fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
  weights: {
    normal: 400,
    semibold: 600,
    bold: 700,
  },
} as const;

/**
 * Chart configuration helper
 * Returns colors array for Recharts or other charting libraries
 */
export function getChartColors(count: number = 6): string[] {
  return colors.chart.slice(0, count);
}

/**
 * Get category color by index (cycles through palette)
 */
export function getCategoryColorByIndex(index: number): string {
  return colors.chart[index % colors.chart.length];
}

/**
 * Default export with all tokens
 */
export const designTokens = {
  colors,
  cssVars,
  radius,
  animation,
  spacing,
  typography,
} as const;

export default designTokens;
