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
 * Fallback console logger for when no factory is registered
 * This ensures the application doesn't crash if logging isn't configured
 */
function createConsoleLogger(category: LogCategoryType | string): ILogger {
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
 * It uses the registered factory or falls back to console logging.
 *
 * @example
 * const logger = getLogger(LogCategory.TRANSACTION);
 * logger.info('Transaction created', { transactionId: '123' });
 */
export function getLogger(category: LogCategoryType | string): ILogger {
  if (loggerFactory) {
    return loggerFactory(category);
  }
  // Fallback to console logger if no factory registered
  return createConsoleLogger(category);
}

/**
 * Alias for getLogger - matches the infrastructure API for easier migration
 * @deprecated Use getLogger instead for clearer intent
 */
export const createLogger = getLogger;
