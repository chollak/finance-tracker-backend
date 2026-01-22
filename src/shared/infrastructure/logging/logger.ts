/**
 * Winston-based structured logging module.
 *
 * Features:
 * - JSON format in production (for ELK/CloudWatch/Datadog)
 * - Pretty colored output in development
 * - Log levels controlled by LOG_LEVEL env var
 * - Category-based logging for filtering
 * - Sensitive data sanitization
 */

import winston from 'winston';

/**
 * Log categories for filtering and grouping logs
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
 * Fields that should be redacted from logs
 */
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'apiKey',
  'api_key',
  'secret',
  'authorization',
  'initData',
  'hash',
  'OPENAI_API_KEY',
  'TG_BOT_API_KEY',
  'SUPABASE_ANON_KEY',
];

/**
 * Sanitize context object by redacting sensitive fields
 */
function sanitizeContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context) return undefined;

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(context)) {
    if (SENSITIVE_FIELDS.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeContext(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Development format - colorized, human-readable
 */
const devFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, category, error, stack, ...meta }) => {
    const cat = category ? `[${category}]` : '';
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    const errorStr = stack ? `\n${stack}` : error ? `\n${error}` : '';
    return `${timestamp} ${level} ${cat} ${message}${metaStr}${errorStr}`;
  })
);

/**
 * Production format - JSON for log aggregation
 */
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

/**
 * Determine log level from environment
 */
function getLogLevel(): string {
  const level = process.env.LOG_LEVEL?.toLowerCase();
  if (level && ['error', 'warn', 'info', 'debug'].includes(level)) {
    return level;
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

/**
 * Main Winston logger instance
 */
const winstonLogger = winston.createLogger({
  level: getLogLevel(),
  format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
  transports: [new winston.transports.Console()],
  // Prevent unhandled rejections from crashing the app
  exitOnError: false,
});

/**
 * Logger interface for type safety
 */
export interface ILogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error | null, context?: Record<string, unknown>): void;
}

/**
 * Create a category-specific logger
 *
 * @example
 * const logger = createLogger(LogCategory.AUTH);
 * logger.info('User authenticated', { userId: '123' });
 * logger.error('Authentication failed', error, { attemptedUser: 'test' });
 */
export function createLogger(category: LogCategoryType | string): ILogger {
  return {
    debug(message: string, context?: Record<string, unknown>): void {
      winstonLogger.debug(message, {
        category,
        ...sanitizeContext(context),
      });
    },

    info(message: string, context?: Record<string, unknown>): void {
      winstonLogger.info(message, {
        category,
        ...sanitizeContext(context),
      });
    },

    warn(message: string, context?: Record<string, unknown>): void {
      winstonLogger.warn(message, {
        category,
        ...sanitizeContext(context),
      });
    },

    error(message: string, error?: Error | null, context?: Record<string, unknown>): void {
      winstonLogger.error(message, {
        category,
        error: error?.message,
        stack: error?.stack,
        ...sanitizeContext(context),
      });
    },
  };
}

/**
 * Default logger instance (for quick usage without category)
 */
export const logger = createLogger(LogCategory.SYSTEM);

/**
 * Export winston logger for advanced use cases
 */
export { winstonLogger };
