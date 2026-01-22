import { Router, Request } from 'express';
import { CreateTransactionUseCase } from '../../application/createTransaction';
import { GetTransactionsUseCase } from '../../application/getTransactions';
import { AnalyticsService } from '../../application/analyticsService';
import { GetUserTransactionsUseCase } from '../../application/getUserTransactions';
import { GetTransactionByIdUseCase } from '../../application/getTransactionById';
import { DeleteTransactionUseCase } from '../../application/deleteTransaction';
import { UpdateTransactionUseCase } from '../../application/updateTransaction';
import { UpdateTransactionWithLearningUseCase } from '../../application/updateTransactionWithLearning';
import { ArchiveTransactionUseCase } from '../../application/archiveTransaction';
import { UnarchiveTransactionUseCase } from '../../application/unarchiveTransaction';
import { ArchiveMultipleTransactionsUseCase } from '../../application/archiveMultipleTransactions';
import { ArchiveAllByUserUseCase } from '../../application/archiveAllByUser';
import { GetArchivedTransactionsUseCase } from '../../application/getArchivedTransactions';
import { Transaction } from '../../domain/transactionEntity';
import { TransactionValidator } from '../../../../shared/application/validation/transactionValidator';
import { handleControllerError, handleControllerSuccess, getStringParam } from '../../../../shared/infrastructure/utils/controllerHelpers';
import { ErrorFactory } from '../../../../shared/domain/errors/AppError';
import { SUCCESS_MESSAGES } from '../../../../shared/domain/constants/messages';
import { SubscriptionModule } from '../../../subscription/subscriptionModule';
import { UserModule } from '../../../user/userModule';
import { createIncrementUsageMiddleware } from '../../../../delivery/web/express/middleware/subscriptionMiddleware';
import { createUserResolutionMiddleware } from '../../../../delivery/web/express/middleware/userResolutionMiddleware';
import { allowGuestMode, verifyOwnership, requireAdmin } from '../../../../delivery/web/express/middleware/authMiddleware';
import { standardRateLimiter } from '../../../../delivery/web/express/middleware/rateLimitMiddleware';
import { verifyResourceOwnership } from '../../../../shared/infrastructure/utils/ownershipVerification';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';
// Import for type extensions on Express.Request
import '../../../../delivery/web/express/middleware/authMiddleware';
import '../../../../delivery/web/express/middleware/userResolutionMiddleware';

const logger = createLogger(LogCategory.TRANSACTION);

/**
 * Fetch transaction and verify ownership
 * Uses shared verifyResourceOwnership helper for consistent behavior
 * Guest users (guest_*) are allowed without verification
 */
async function verifyTransactionOwnership(
  req: Request,
  transactionId: string,
  getByIdUseCase: GetTransactionByIdUseCase,
  userModule?: UserModule
): Promise<Transaction> {
  const transaction = await getByIdUseCase.execute(transactionId);

  if (!transaction) {
    throw ErrorFactory.notFound('Transaction not found');
  }

  await verifyResourceOwnership(req, transaction, userModule, {
    resourceType: 'transaction',
    allowGuest: true,
  });

  return transaction;
}

export function createTransactionRouter(
  createUseCase: CreateTransactionUseCase,
  getUseCase: GetTransactionsUseCase,
  analyticsService: AnalyticsService,
  getUserUseCase: GetUserTransactionsUseCase,
  getByIdUseCase: GetTransactionByIdUseCase,
  deleteUseCase: DeleteTransactionUseCase,
  updateUseCase: UpdateTransactionUseCase,
  updateWithLearningUseCase: UpdateTransactionWithLearningUseCase,
  archiveUseCase: ArchiveTransactionUseCase,
  unarchiveUseCase: UnarchiveTransactionUseCase,
  archiveMultipleUseCase: ArchiveMultipleTransactionsUseCase,
  archiveAllByUserUseCase: ArchiveAllByUserUseCase,
  getArchivedUseCase: GetArchivedTransactionsUseCase,
  subscriptionModule?: SubscriptionModule,
  userModule?: UserModule
): Router {
  const router = Router();

  // User resolution middleware (resolves telegramId to UUID)
  const resolveUser = userModule
    ? createUserResolutionMiddleware(userModule)
    : (_req: any, _res: any, next: any) => next();

  // Create increment middleware if subscription modules are available
  const incrementTransactionMiddleware = subscriptionModule && userModule
    ? createIncrementUsageMiddleware(subscriptionModule, userModule, 'transactions')
    : null;

  // Apply rate limiting to all routes
  router.use(standardRateLimiter);

  // Global analytics - ADMIN ONLY (returns data for all users)
  router.get('/analytics', requireAdmin, async (_req, res) => {
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
  // Protected with auth + ownership verification
  router.get('/analytics/summary/:userId', allowGuestMode, resolveUser, verifyOwnership, async (req, res) => {
    try {
      // Use resolved UUID from middleware (falls back to raw param if not resolved)
      const userId = req.resolvedUser?.id || req.params.userId;
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

  router.get('/analytics/categories/:userId', allowGuestMode, resolveUser, verifyOwnership, async (req, res) => {
    try {
      // Use resolved UUID from middleware
      const userId = req.resolvedUser?.id || req.params.userId;
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

  router.get('/analytics/trends/:userId', allowGuestMode, resolveUser, verifyOwnership, async (req, res) => {
    try {
      // Use resolved UUID from middleware
      const userId = req.resolvedUser?.id || req.params.userId;
      const months = req.query.months ? parseInt(req.query.months as string) : 12;

      const trends = await analyticsService.getMonthlyTrends(userId, months);
      handleControllerSuccess(trends, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  router.get('/analytics/patterns/:userId', allowGuestMode, resolveUser, verifyOwnership, async (req, res) => {
    try {
      // Use resolved UUID from middleware
      const userId = req.resolvedUser?.id || req.params.userId;
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

  router.get('/analytics/top-categories/:userId', allowGuestMode, resolveUser, verifyOwnership, async (req, res) => {
    try {
      // Use resolved UUID from middleware
      const userId = req.resolvedUser?.id || req.params.userId;
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

  // Build middleware chain for POST - add increment middleware if available
  const postMiddlewares = incrementTransactionMiddleware
    ? [incrementTransactionMiddleware]
    : [];

  router.post('/', ...postMiddlewares, async (req, res) => {
    try {
      // Use resolved UUID from middleware (for body.userId)
      if (req.resolvedUser?.id && req.body.userId) {
        req.body.userId = req.resolvedUser.id;
      }

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

  // Get ALL transactions - ADMIN ONLY (returns data for all users)
  router.get('/', requireAdmin, async (_req, res) => {
    try {
      const transactions = await getUseCase.execute();
      handleControllerSuccess(transactions, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  router.get('/user/:userId', allowGuestMode, resolveUser, verifyOwnership, async (req, res) => {
    try {
      // Use resolved UUID from middleware
      const userId = req.resolvedUser?.id || getStringParam(req, 'userId');

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

  // Transaction by ID routes - require auth + ownership verification
  router.get('/:id', allowGuestMode, async (req, res) => {
    try {
      const transactionId = getStringParam(req, 'id');

      if (!transactionId) {
        const error = ErrorFactory.validation('Transaction ID is required');
        return handleControllerError(error, res);
      }

      // Verify ownership before returning transaction
      const transaction = await verifyTransactionOwnership(req, transactionId, getByIdUseCase, userModule);
      handleControllerSuccess(transaction, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  router.delete('/:id', allowGuestMode, async (req, res) => {
    try {
      const transactionId = getStringParam(req, 'id');

      if (!transactionId) {
        const error = ErrorFactory.validation('Transaction ID is required');
        return handleControllerError(error, res);
      }

      // Verify ownership before deleting
      await verifyTransactionOwnership(req, transactionId, getByIdUseCase, userModule);

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

  router.put('/:id', allowGuestMode, async (req, res) => {
    try {
      const transactionId = getStringParam(req, 'id');

      if (!transactionId) {
        const error = ErrorFactory.validation('Transaction ID is required');
        return handleControllerError(error, res);
      }

      // Verify ownership before updating
      await verifyTransactionOwnership(req, transactionId, getByIdUseCase, userModule);

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
      
      logger.debug('Transaction update request', {
        transactionId,
        hasLearningContext,
        userId: req.body.userId?.substring(0, 8),
        updates: Object.keys(updates)
      });

      let updatedTransaction;
      if (hasLearningContext) {
        logger.debug('Using learning-enabled update');
        // Use learning-enabled update
        updatedTransaction = await updateWithLearningUseCase.execute({
          id: transactionId,
          ...updates,
          userId: req.body.userId,
          originalText: req.body.originalText,
          originalParsing: req.body.originalParsing
        });
      } else {
        logger.debug('Using regular update (no learning context)');
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

  // Archive endpoints - require ownership verification
  router.post('/:id/archive', allowGuestMode, async (req, res) => {
    try {
      const transactionId = getStringParam(req, 'id');

      if (!transactionId) {
        const error = ErrorFactory.validation('Transaction ID is required');
        return handleControllerError(error, res);
      }

      // Verify ownership before archiving
      await verifyTransactionOwnership(req, transactionId, getByIdUseCase, userModule);

      await archiveUseCase.execute(transactionId);
      handleControllerSuccess(
        { message: 'Transaction archived successfully' },
        res,
        200
      );
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  router.post('/:id/unarchive', allowGuestMode, async (req, res) => {
    try {
      const transactionId = getStringParam(req, 'id');

      if (!transactionId) {
        const error = ErrorFactory.validation('Transaction ID is required');
        return handleControllerError(error, res);
      }

      // Verify ownership before unarchiving
      await verifyTransactionOwnership(req, transactionId, getByIdUseCase, userModule);

      await unarchiveUseCase.execute(transactionId);
      handleControllerSuccess(
        { message: 'Transaction unarchived successfully' },
        res,
        200
      );
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  router.post('/archive/batch', allowGuestMode, async (req, res) => {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        const error = ErrorFactory.validation('Array of transaction IDs is required');
        return handleControllerError(error, res);
      }

      // Verify ownership for ALL transactions before archiving any
      for (const transactionId of ids) {
        await verifyTransactionOwnership(req, transactionId, getByIdUseCase, userModule);
      }

      const result = await archiveMultipleUseCase.execute(ids);
      handleControllerSuccess(result, res, 200);
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  router.post('/archive/all/:userId', allowGuestMode, resolveUser, verifyOwnership, async (req, res) => {
    try {
      // Use resolved UUID from middleware
      const userId = req.resolvedUser?.id || getStringParam(req, 'userId');

      if (!userId) {
        const error = ErrorFactory.validation('User ID is required');
        return handleControllerError(error, res);
      }

      const result = await archiveAllByUserUseCase.execute(userId);
      handleControllerSuccess(result, res, 200);
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  router.get('/archived/user/:userId', allowGuestMode, resolveUser, verifyOwnership, async (req, res) => {
    try {
      // Use resolved UUID from middleware
      const userId = req.resolvedUser?.id || getStringParam(req, 'userId');
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

      if (!userId) {
        const error = ErrorFactory.validation('User ID is required');
        return handleControllerError(error, res);
      }

      const transactions = await getArchivedUseCase.execute(userId, limit);
      handleControllerSuccess(transactions, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  return router;
}
