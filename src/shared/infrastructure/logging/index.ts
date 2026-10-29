/**
 * Logging module exports
 *
 * @example
 * import { createLogger, LogCategory } from './shared/infrastructure/logging';
 *
 * const logger = createLogger(LogCategory.AUTH);
 * logger.info('User logged in', { userId: '123' });
 * logger.error('Login failed', error, { email: 'test@example.com' });
 */

export { createLogger, logger, LogCategory, winstonLogger } from './logger';
export type { ILogger, LogCategoryType } from './logger';
export { createRefusalLog, REFUSAL_LOG_MAX_IDS, REFUSAL_LOG_WINDOW_MS } from './refusalLog';
export type { RefusalLog, RefusalLogOptions } from './refusalLog';
