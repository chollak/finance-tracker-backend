/**
 * Logger Port (Interface)
 *
 * This is the logging abstraction that the application layer depends on.
 * The actual implementation (Winston, Pino, etc.) lives in infrastructure.
 *
 * This follows the Dependency Inversion Principle:
 * - High-level modules (Application) depend on abstractions (this interface)
 * - Low-level modules (Infrastructure) implement these abstractions
 */

/**
 * Log categories for filtering and grouping logs
 * Defined in domain so both application and infrastructure can use them
 */
export const LogCategory = {
  // System
  SYSTEM: 'SYSTEM',
  CONFIG: 'CONFIG',
  DATABASE: 'DATABASE',

  // Security
  AUTH: 'AUTH',
  RATE_LIMIT: 'RATE_LIMIT',
  SECURITY: 'SECURITY',

  // Business Logic
  TRANSACTION: 'TRANSACTION',
  DEBT: 'DEBT',
  BUDGET: 'BUDGET',
  SUBSCRIPTION: 'SUBSCRIPTION',
  USER: 'USER',
  LEARNING: 'LEARNING',
  DASHBOARD: 'DASHBOARD',

  // External Services
  OPENAI: 'OPENAI',
  TELEGRAM: 'TELEGRAM',
  SUPABASE: 'SUPABASE',

  // Request Handling
  HTTP: 'HTTP',
  TELEGRAM_MSG: 'TELEGRAM_MSG',

  // Performance
  PERFORMANCE: 'PERFORMANCE',
} as const;

export type LogCategoryType = (typeof LogCategory)[keyof typeof LogCategory];

/**
 * Logger interface - the contract that any logging implementation must fulfill
 */
export interface ILogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error | null, context?: Record<string, unknown>): void;
}

/**
 * Logger factory interface - creates category-specific loggers
 */
export interface ILoggerFactory {
  createLogger(category: LogCategoryType | string): ILogger;
}
