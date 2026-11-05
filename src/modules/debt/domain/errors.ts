/**
 * Debt Module Domain Errors
 */

import { AppError } from '../../../shared/domain/errors/AppError';

/**
 * The limit of active debts on the free tier. The limit is gone (#265) and nothing throws this any more; the frozen
 * capture path still checks for it until #266.
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
