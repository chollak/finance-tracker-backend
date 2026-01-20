/**
 * Debt Module Domain Errors
 */

import { AppError } from '../../../shared/domain/errors/AppError';

/**
 * Error thrown when user has reached the maximum number of active debts
 * for their subscription tier (Free: 5, Premium: unlimited)
 */
export class DebtLimitExceededError extends AppError {
  readonly code = 'DEBT_LIMIT_EXCEEDED';
  readonly statusCode = 403;

  constructor(limit: number, current: number) {
    super(
      `Лимит активных долгов исчерпан (${current}/${limit}). Оформите Premium для безлимита.`,
      { limit, current }
    );
  }
}
