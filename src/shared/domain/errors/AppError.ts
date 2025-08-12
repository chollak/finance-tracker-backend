/**
 * Base application error with standardized structure
 */
export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  readonly timestamp: string;

  constructor(message: string, public readonly context?: Record<string, any>) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date().toISOString();
    
    // Ensure proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      context: this.context
    };
  }
}

// Specific error types
export class ValidationError extends AppError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;

  constructor(message: string, public readonly field?: string, context?: Record<string, any>) {
    super(message, { ...context, field });
  }
}

export class NotFoundError extends AppError {
  readonly code = 'NOT_FOUND';
  readonly statusCode = 404;

  constructor(resource: string, identifier?: string) {
    super(`${resource} not found${identifier ? `: ${identifier}` : ''}`);
  }
}

export class ExternalServiceError extends AppError {
  readonly code = 'EXTERNAL_SERVICE_ERROR';
  readonly statusCode = 502;

  constructor(service: string, originalError?: Error) {
    super(`External service error: ${service}`, { originalError: originalError?.message });
  }
}

export class ConfigurationError extends AppError {
  readonly code = 'CONFIGURATION_ERROR';
  readonly statusCode = 500;

  constructor(message: string) {
    super(`Configuration error: ${message}`);
  }
}

export class BusinessLogicError extends AppError {
  readonly code = 'BUSINESS_LOGIC_ERROR';
  readonly statusCode = 422;

  constructor(message: string, context?: Record<string, any>) {
    super(message, context);
  }
}

// Error factory
export class ErrorFactory {
  static validation(message: string, field?: string): ValidationError {
    return new ValidationError(message, field);
  }

  static notFound(resource: string, identifier?: string): NotFoundError {
    return new NotFoundError(resource, identifier);
  }

  static externalService(service: string, originalError?: Error): ExternalServiceError {
    return new ExternalServiceError(service, originalError);
  }

  static configuration(message: string): ConfigurationError {
    return new ConfigurationError(message);
  }

  static businessLogic(message: string, context?: Record<string, any>): BusinessLogicError {
    return new BusinessLogicError(message, context);
  }
}