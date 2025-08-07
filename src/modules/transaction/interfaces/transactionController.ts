import { Router } from 'express';
import { CreateTransactionUseCase } from '../application/createTransaction';
import { GetTransactionsUseCase } from '../application/getTransactions';
import { AnalyticsService } from '../application/analyticsService';
import { GetUserTransactionsUseCase } from '../application/getUserTransactions';
import { Transaction } from '../domain/transactionEntity';
import { TransactionValidator } from '../../../shared/validation/transactionValidator';
import { handleControllerError, handleControllerSuccess, getStringParam } from '../../../shared/utils/controllerHelpers';
import { ErrorFactory } from '../../../shared/errors/AppError';
import { SUCCESS_MESSAGES } from '../../../shared/constants/messages';

export function createTransactionRouter(
  createUseCase: CreateTransactionUseCase,
  getUseCase: GetTransactionsUseCase,
  analyticsService: AnalyticsService,
  getUserUseCase: GetUserTransactionsUseCase
): Router {
  const router = Router();

  router.get('/analytics', async (req, res) => {
    try {
      const summary = await analyticsService.getSummary();
      const categoryBreakdown = await analyticsService.getCategoryBreakdown();
      
      handleControllerSuccess({
        totalIncome: summary.totalIncome,
        totalExpense: summary.totalExpense,
        categoryBreakdown
      }, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  router.post('/', async (req, res) => {
    try {
      // Validate input using our new validation system
      const validationResult = TransactionValidator.validate(req.body);
      
      if (!validationResult.success) {
        // Return validation errors in standardized format
        const validationError = ErrorFactory.validation(
          `Validation failed: ${validationResult.error.map(e => e.message).join(', ')}`
        );
        return handleControllerError(validationError, res);
      }

      const transaction = validationResult.data;
      const createdId = await createUseCase.execute(transaction);
      
      handleControllerSuccess(
        { id: createdId, transaction }, 
        res, 
        201, 
        SUCCESS_MESSAGES.TRANSACTION_CREATED
      );
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  router.get('/', async (req, res) => {
    try {
      const transactions = await getUseCase.execute();
      handleControllerSuccess(transactions, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  router.get('/user/:userId', async (req, res) => {
    try {
      const userId = getStringParam(req, 'userId');
      
      if (!userId) {
        const error = ErrorFactory.validation('User ID is required');
        return handleControllerError(error, res);
      }

      const transactions = await getUserUseCase.execute(userId);
      handleControllerSuccess(transactions, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  return router;
}
