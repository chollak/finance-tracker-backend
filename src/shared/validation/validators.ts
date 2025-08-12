import { AppConfig } from '../../config/appConfig';
import { ValidationError } from '../errors/AppError';
import { Result, ResultHelper } from '../types/Result';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Common validation utilities
 */
export class Validators {
  static required(value: any, fieldName: string): Result<any, ValidationError> {
    if (value === null || value === undefined || value === '') {
      return ResultHelper.failure(new ValidationError(`${fieldName} is required`, fieldName));
    }
    return ResultHelper.success(value);
  }

  static string(value: any, fieldName: string): Result<string, ValidationError> {
    if (typeof value !== 'string') {
      return ResultHelper.failure(new ValidationError(`${fieldName} must be a string`, fieldName));
    }
    return ResultHelper.success(value);
  }

  static number(value: any, fieldName: string): Result<number, ValidationError> {
    const num = Number(value);
    if (isNaN(num)) {
      return ResultHelper.failure(new ValidationError(`${fieldName} must be a number`, fieldName));
    }
    return ResultHelper.success(num);
  }

  static positiveNumber(value: any, fieldName: string): Result<number, ValidationError> {
    const numberResult = this.number(value, fieldName);
    if (!numberResult.success) return numberResult;

    if (numberResult.data <= 0) {
      return ResultHelper.failure(new ValidationError(`${fieldName} must be positive`, fieldName));
    }
    return numberResult;
  }

  static minLength(value: string, min: number, fieldName: string): Result<string, ValidationError> {
    if (value.length < min) {
      return ResultHelper.failure(
        new ValidationError(`${fieldName} must be at least ${min} characters`, fieldName)
      );
    }
    return ResultHelper.success(value);
  }

  static maxLength(value: string, max: number, fieldName: string): Result<string, ValidationError> {
    if (value.length > max) {
      return ResultHelper.failure(
        new ValidationError(`${fieldName} must be no more than ${max} characters`, fieldName)
      );
    }
    return ResultHelper.success(value);
  }

  static oneOf<T>(value: T, allowedValues: T[], fieldName: string): Result<T, ValidationError> {
    if (!allowedValues.includes(value)) {
      return ResultHelper.failure(
        new ValidationError(
          `${fieldName} must be one of: ${allowedValues.join(', ')}`, 
          fieldName
        )
      );
    }
    return ResultHelper.success(value);
  }

  static dateString(value: any, fieldName: string): Result<string, ValidationError> {
    const stringResult = this.string(value, fieldName);
    if (!stringResult.success) return stringResult;

    const date = new Date(stringResult.data);
    if (isNaN(date.getTime())) {
      return ResultHelper.failure(new ValidationError(`${fieldName} must be a valid date`, fieldName));
    }
    return stringResult;
  }

  static amount(value: any): Result<number, ValidationError> {
    const numberResult = this.number(value, 'amount');
    if (!numberResult.success) return numberResult;

    if (numberResult.data < 0.01) {
      return ResultHelper.failure(
        new ValidationError(`Amount must be at least 0.01`, 'amount')
      );
    }

    if (numberResult.data > 1000000000) {
      return ResultHelper.failure(
        new ValidationError(`Amount must be no more than 1,000,000,000`, 'amount')
      );
    }

    return numberResult;
  }

  static category(value: any): Result<string, ValidationError> {
    const stringResult = this.string(value, 'category');
    if (!stringResult.success) return stringResult;

    return this.maxLength(stringResult.data, 50, 'category');
  }

  static description(value: any): Result<string, ValidationError> {
    const stringResult = this.string(value, 'description');
    if (!stringResult.success) return stringResult;

    return this.maxLength(stringResult.data, 500, 'description');
  }

  static transactionType(value: any): Result<'income' | 'expense', ValidationError> {
    return this.oneOf(value, ['income', 'expense'] as const, 'type');
  }
}

/**
 * Combine multiple validation results
 */
export class ValidationChain {
  private errors: ValidationError[] = [];

  validate<T>(result: Result<T, ValidationError>): this {
    if (!result.success) {
      this.errors.push(result.error);
    }
    return this;
  }

  getResult(): Result<true, ValidationError[]> {
    if (this.errors.length > 0) {
      return ResultHelper.failure(this.errors);
    }
    return ResultHelper.success(true);
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  getErrors(): ValidationError[] {
    return this.errors;
  }
}