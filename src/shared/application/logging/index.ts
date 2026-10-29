/**
 * Application Layer Logging
 *
 * This module provides logging capabilities to the application layer
 * while maintaining proper dependency direction (Application → Domain, not Application → Infrastructure).
 *
 * The types (ILogger, LogCategory) come from Domain ports.
 * The implementation is injected from Infrastructure via a registry pattern.
 *
 * Usage in application layer:
 * ```typescript
 * import { getLogger, LogCategory } from '../../../shared/application/logging';
 * const logger = getLogger(LogCategory.TRANSACTION);
 * logger.info('Transaction created', { id: '123' });
 * ```
 */

import { type ILogger, type LogCategoryType, LogCategory } from '../../domain/ports/Logger';

// Re-export types from domain for convenience
export { LogCategory, type LogCategoryType, type ILogger };

/**
 * Logger factory function type
 */
type LoggerFactory = (category: LogCategoryType | string) => ILogger;

/**
 * Logger registry - holds the concrete logger factory
 * This is set at application startup by the composition root
 */
let loggerFactory: LoggerFactory | null = null;

/**
 * Jest output stays focused on assertions unless TEST_LOGS=true. Decided once at load, as Winston decides `silent`:
 * the fallback is built on every write, and a test that sets NODE_ENV=production for a while would otherwise
 * print to the console (FT-165).
 */
const SILENT_IN_TESTS = process.env.NODE_ENV === 'test' && process.env.TEST_LOGS !== 'true';

/**
 * Fallback console logger for when no factory is registered
 * This ensures the application doesn't crash if logging isn't configured
 */
function createConsoleLogger(category: LogCategoryType | string): ILogger {
  if (SILENT_IN_TESTS) {
    return {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    };
  }

  const prefix = `[${category}]`;
  return {
    debug: (message, context) => console.debug(prefix, message, context ?? ''),
    info: (message, context) => console.info(prefix, message, context ?? ''),
    warn: (message, context) => console.warn(prefix, message, context ?? ''),
    error: (message, error, context) => console.error(prefix, message, error ?? '', context ?? ''),
  };
}

/**
 * Register the logger factory (called from composition root)
 *
 * @example
 * // In appModules.ts or index.ts
 * import { createLogger } from './shared/infrastructure/logging';
 * import { registerLoggerFactory } from './shared/application/logging';
 * registerLoggerFactory(createLogger);
 */
export function registerLoggerFactory(factory: LoggerFactory): void {
  loggerFactory = factory;
}

/**
 * Get a logger for a specific category
 *
 * This is the main entry point for application layer logging.
 * The factory is looked up on every call, not here: application files take their logger at import
 * (`const logger = getLogger(…)`), before the composition root registers the factory, and a logger resolved
 * then would write through the console fallback for good — without time and level (FT-165).
 * Until a factory is registered, lines go to the console fallback.
 *
 * @example
 * const logger = getLogger(LogCategory.TRANSACTION);
 * logger.info('Transaction created', { transactionId: '123' });
 */
export function getLogger(category: LogCategoryType | string): ILogger {
  const current = (): ILogger => (loggerFactory ? loggerFactory(category) : createConsoleLogger(category));
  return {
    debug: (message, context) => current().debug(message, context),
    info: (message, context) => current().info(message, context),
    warn: (message, context) => current().warn(message, context),
    error: (message, error, context) => current().error(message, error, context),
  };
}

/**
 * What a `warn` line says about an error: its message and, for an AppError, what it keeps about its cause
 * (`errorContext`, as `logger.error` writes it) — «Request timed out.» behind «External service error: OpenAI Chat».
 *
 * @example
 * logger.warn('The AI could not read a simple phrase; its label is kept', errorFields(error));
 */
export function errorFields(error: unknown): { error: string; errorContext?: Record<string, unknown> } {
  const message = error instanceof Error ? error.message : String(error);
  const context = (error as { context?: unknown } | null | undefined)?.context;
  return context && typeof context === 'object'
    ? { error: message, errorContext: context as Record<string, unknown> }
    : { error: message };
}

/**
 * Alias for getLogger - matches the infrastructure API for easier migration
 * @deprecated Use getLogger instead for clearer intent
 */
export const createLogger = getLogger;
