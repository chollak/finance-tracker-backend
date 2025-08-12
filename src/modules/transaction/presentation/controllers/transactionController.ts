import { Router } from 'express';
import { CreateTransactionUseCase } from '../../application/createTransaction';
import { GetTransactionsUseCase } from '../../application/getTransactions';
import { AnalyticsService } from '../../application/analyticsService';
import { GetUserTransactionsUseCase } from '../../application/getUserTransactions';
import { DeleteTransactionUseCase } from '../../application/deleteTransaction';
import { UpdateTransactionUseCase } from '../../application/updateTransaction';
import { UpdateTransactionWithLearningUseCase } from '../../application/updateTransactionWithLearning';
import { Transaction } from '../../domain/transactionEntity';
import { TransactionValidator } from '../../../../shared/application/validation/transactionValidator';
import { handleControllerError, handleControllerSuccess, getStringParam } from '../../../../shared/infrastructure/utils/controllerHelpers';
import { ErrorFactory } from '../../../../shared/domain/errors/AppError';
import { SUCCESS_MESSAGES } from '../../../../shared/domain/constants/messages';

export function createTransactionRouter(
  createUseCase: CreateTransactionUseCase,
  getUseCase: GetTransactionsUseCase,
  analyticsService: AnalyticsService,
  getUserUseCase: GetUserTransactionsUseCase,
  deleteUseCase: DeleteTransactionUseCase,
  updateUseCase: UpdateTransactionUseCase,
  updateWithLearningUseCase: UpdateTransactionWithLearningUseCase
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

  // Enhanced analytics endpoints with time filtering
  router.get('/analytics/summary/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const { startDate, endDate } = req.query;

      let timeRange = undefined;
      if (startDate && endDate) {
        timeRange = {
          startDate: new Date(startDate as string),
          endDate: new Date(endDate as string)
        };
      }

      const summary = await analyticsService.getAnalyticsSummary(userId, timeRange);
      handleControllerSuccess(summary, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  router.get('/analytics/categories/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const { startDate, endDate } = req.query;

      let timeRange = undefined;
      if (startDate && endDate) {
        timeRange = {
          startDate: new Date(startDate as string),
          endDate: new Date(endDate as string)
        };
      }

      const breakdown = await analyticsService.getDetailedCategoryBreakdown(userId, timeRange);
      handleControllerSuccess(breakdown, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  router.get('/analytics/trends/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const months = req.query.months ? parseInt(req.query.months as string) : 12;

      const trends = await analyticsService.getMonthlyTrends(userId, months);
      handleControllerSuccess(trends, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  router.get('/analytics/patterns/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const { startDate, endDate } = req.query;

      let timeRange = undefined;
      if (startDate && endDate) {
        timeRange = {
          startDate: new Date(startDate as string),
          endDate: new Date(endDate as string)
        };
      }

      const patterns = await analyticsService.getSpendingPatterns(userId, timeRange);
      handleControllerSuccess(patterns, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  router.get('/analytics/top-categories/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const { startDate, endDate, limit } = req.query;

      let timeRange = undefined;
      if (startDate && endDate) {
        timeRange = {
          startDate: new Date(startDate as string),
          endDate: new Date(endDate as string)
        };
      }

      const limitNum = limit ? parseInt(limit as string) : 5;
      const topCategories = await analyticsService.getTopCategories(userId, timeRange, limitNum);
      handleControllerSuccess(topCategories, res);
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

  router.delete('/:id', async (req, res) => {
    try {
      const transactionId = getStringParam(req, 'id');
      
      if (!transactionId) {
        const error = ErrorFactory.validation('Transaction ID is required');
        return handleControllerError(error, res);
      }

      await deleteUseCase.execute(transactionId);
      handleControllerSuccess(
        { message: SUCCESS_MESSAGES.TRANSACTION_DELETED },
        res,
        200,
        SUCCESS_MESSAGES.TRANSACTION_DELETED
      );
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      const transactionId = getStringParam(req, 'id');
      
      if (!transactionId) {
        const error = ErrorFactory.validation('Transaction ID is required');
        return handleControllerError(error, res);
      }

      // Validate the update data - allow partial updates
      const allowedFields = ['amount', 'category', 'description', 'date', 'type', 'merchant'];
      const updates: any = {};
      
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      // Ensure we have at least one field to update
      if (Object.keys(updates).length === 0) {
        const error = ErrorFactory.validation('At least one field must be provided for update');
        return handleControllerError(error, res);
      }

      // Check if we have learning context
      const hasLearningContext = req.body.userId && req.body.originalText && req.body.originalParsing;
      
      console.log('📝 TRANSACTION UPDATE:', {
        transactionId,
        hasLearningContext,
        userId: req.body.userId?.substring(0, 8),
        originalText: req.body.originalText?.substring(0, 50),
        updates: Object.keys(updates)
      });
      
      let updatedTransaction;
      if (hasLearningContext) {
        console.log('🤖 Using learning-enabled update');
        // Use learning-enabled update
        updatedTransaction = await updateWithLearningUseCase.execute({
          id: transactionId,
          ...updates,
          userId: req.body.userId,
          originalText: req.body.originalText,
          originalParsing: req.body.originalParsing
        });
      } else {
        console.log('📝 Using regular update (no learning context)');
        // Use regular update
        updatedTransaction = await updateUseCase.execute({
          id: transactionId,
          ...updates
        });
      }

      handleControllerSuccess(
        updatedTransaction,
        res,
        200,
        SUCCESS_MESSAGES.TRANSACTION_UPDATED
      );
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  return router;
}
