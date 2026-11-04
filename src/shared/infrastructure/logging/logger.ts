/**
 * Winston-based structured logging module.
 *
 * This is the Infrastructure implementation of the ILogger port.
 *
 * Features:
 * - JSON format in production (for ELK/CloudWatch/Datadog)
 * - Pretty colored output in development
 * - Log levels controlled by LOG_LEVEL env var
 * - Category-based logging for filtering
 * - Secrets masked in the message, the error, its stack and every field (#269, `redact.ts`)
 */

// First: LOG_LEVEL and NODE_ENV from .env.local / .env are read below when the logger is created (FT-165)
import '../config/loadEnvironment';
import winston from 'winston';
import { LogCategory, type LogCategoryType, type ILogger } from '../../domain/ports/Logger';
import { redactContext, redactText } from './redact';

// Re-export from domain for backward compatibility
export { LogCategory, type LogCategoryType, type ILogger };

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
 * Keep Jest output focused on assertion failures. Production/development logging
 * stays unchanged unless TEST_LOGS=true is explicitly set for debugging tests.
 */
function isTestLoggingDisabled(): boolean {
  return process.env.NODE_ENV === 'test' && process.env.TEST_LOGS !== 'true';
}

/**
 * Main Winston logger instance
 */
const winstonLogger = winston.createLogger({
  level: getLogLevel(),
  format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
  transports: [new winston.transports.Console()],
  silent: isTestLoggingDisabled(),
  // Prevent unhandled rejections from crashing the app
  exitOnError: false,
});

/** An error's message or stack, masked; a value that is not text stays out, as before. */
function redactedOrNothing(text: unknown): string | undefined {
  return typeof text === 'string' ? redactText(text) : undefined;
}

/**
 * Create a category-specific logger. Everything it hands to Winston is masked already (#269): the message, the error,
 * its stack and every field — so any format and transport writes it masked.
 *
 * @example
 * const logger = createLogger(LogCategory.AUTH);
 * logger.info('User authenticated', { userId: '123' });
 * logger.error('Authentication failed', error, { attemptedUser: 'test' });
 */
export function createLogger(category: LogCategoryType | string): ILogger {
  return {
    debug(message: string, context?: Record<string, unknown>): void {
      winstonLogger.debug(redactText(message), {
        category,
        ...redactContext(context),
      });
    },

    info(message: string, context?: Record<string, unknown>): void {
      winstonLogger.info(redactText(message), {
        category,
        ...redactContext(context),
      });
    },

    warn(message: string, context?: Record<string, unknown>): void {
      winstonLogger.warn(redactText(message), {
        category,
        ...redactContext(context),
      });
    },

    error(message: string, error?: Error | null, context?: Record<string, unknown>): void {
      // An AppError keeps its cause in `context` (the OpenAI message behind «External service error: OpenAI Chat»)
      const errorContext = (error as { context?: unknown } | null | undefined)?.context;
      winstonLogger.error(redactText(message), {
        category,
        error: redactedOrNothing(error?.message),
        stack: redactedOrNothing(error?.stack),
        ...(errorContext && typeof errorContext === 'object'
          ? { errorContext: redactContext(errorContext as Record<string, unknown>) }
          : {}),
        ...redactContext(context),
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
