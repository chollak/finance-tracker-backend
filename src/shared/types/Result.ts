/**
 * Result pattern for better error handling
 * Eliminates the need for try/catch in business logic
 */
export type Result<T, E = Error> = Success<T> | Failure<E>;

export interface Success<T> {
  success: true;
  data: T;
}

export interface Failure<E> {
  success: false;
  error: E;
}

export class ResultHelper {
  static success<T>(data: T): Success<T> {
    return { success: true, data };
  }

  static failure<E>(error: E): Failure<E> {
    return { success: false, error };
  }

  static isSuccess<T, E>(result: Result<T, E>): result is Success<T> {
    return result.success;
  }

  static isFailure<T, E>(result: Result<T, E>): result is Failure<E> {
    return !result.success;
  }

  static getData<T, E>(result: Result<T, E>): T | null {
    return this.isSuccess(result) ? result.data : null;
  }

  static getError<T, E>(result: Result<T, E>): E | null {
    return this.isFailure(result) ? result.error : null;
  }

  /**
   * Transform success data, leave error as is
   */
  static map<T, U, E>(result: Result<T, E>, fn: (data: T) => U): Result<U, E> {
    return this.isSuccess(result) 
      ? this.success(fn(result.data))
      : result;
  }

  /**
   * Chain multiple operations that return Results
   */
  static flatMap<T, U, E>(result: Result<T, E>, fn: (data: T) => Result<U, E>): Result<U, E> {
    return this.isSuccess(result) 
      ? fn(result.data)
      : result;
  }

  /**
   * Convert Promise to Result
   */
  static async fromPromise<T>(promise: Promise<T>): Promise<Result<T, Error>> {
    try {
      const data = await promise;
      return this.success(data);
    } catch (error) {
      return this.failure(error instanceof Error ? error : new Error(String(error)));
    }
  }
}