/**
 * Domain Ports
 *
 * Ports define the interfaces (contracts) that the application layer uses.
 * The actual implementations are provided by the infrastructure layer.
 *
 * This is the "Ports" part of "Ports and Adapters" (Hexagonal Architecture).
 */

export { LogCategory, type LogCategoryType, type ILogger, type ILoggerFactory } from './Logger';
