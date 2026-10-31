import { Router, Request } from 'express';
import { CreateTransactionUseCase } from '../../application/createTransaction';
import { GetTransactionHistoryUseCase } from '../../application/getTransactionHistory';
import { GetPeriodTotalsUseCase } from '../../application/getPeriodTotals';
import { GetFrequentRecordsUseCase } from '../../application/getFrequentRecords';
import { AnalyticsService } from '../../application/analyticsService';
import { GetUserTransactionsUseCase } from '../../application/getUserTransactions';
import { GetTransactionByIdUseCase } from '../../application/getTransactionById';
import { DeleteTransactionUseCase, RestoreTransactionUseCase } from '../../application/deleteTransaction';
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
import { createUserResolutionMiddleware } from '../../../../delivery/web/express/middleware/userResolutionMiddleware';
import {
  allowGuestMode,
  optionalAuth,
  optionalAuthOrAppToken,
  verifyOwnership,
  requireAuth,
} from '../../../../delivery/web/express/middleware/authMiddleware';
import { standardRateLimiter } from '../../../../delivery/web/express/middleware/rateLimitMiddleware';
import {
  createCurrentUserMiddleware,
  createCurrentUserOrAppTokenMiddleware,
  createResolveCurrentUserMiddleware,
  currentUserId,
} from '../../../../delivery/web/express/middleware/currentUserMiddleware';
import { verifyResourceOwnership } from '../../../../shared/infrastructure/utils/ownershipVerification';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';
// Import for type extensions on Express.Request
import '../../../../delivery/web/express/middleware/authMiddleware';
import '../../../../delivery/web/express/middleware/userResolutionMiddleware';

const logger = createLogger(LogCategory.TRANSACTION);

/**
 * Fetch transaction and verify ownership
 * Uses shared verifyResourceOwnership helper for consistent behavior
 * Returns null if transaction not found or ownership verification fails
 */
async function verifyTransactionOwnershipWithResult(
  req: Request,
  transactionId: string,
  getByIdUseCase: GetTransactionByIdUseCase,
  userModule?: UserModule,
  options?: { includeArchived?: boolean; includeDeleted?: boolean }
): Promise<{ success: true; transaction: Transaction } | { success: false; error: Error }> {
  const result = await getByIdUseCase.execute(transactionId, options);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  try {
    await verifyResourceOwnership(req, result.data, userModule, {
      resourceType: 'transaction',
    });
    return { success: true, transaction: result.data };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}

export function createTransactionRouter(
  createUseCase: CreateTransactionUseCase,
  historyUseCase: GetTransactionHistoryUseCase,
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
  // Kept for the router's call signature; usage is counted in CreateTransactionUseCase.
  _subscriptionModule?: SubscriptionModule,
  userModule?: UserModule,
  restoreUseCase?: RestoreTransactionUseCase,
  periodTotalsUseCase?: GetPeriodTotalsUseCase,
  frequentRecordsUseCase?: GetFrequentRecordsUseCase
): Router {
  const router = Router();

  // User resolution middleware (resolves telegramId to UUID)
  const resolveUser = userModule
    ? createUserResolutionMiddleware(userModule)
    : (_req: any, _res: any, next: any) => next();

  // Apply rate limiting to all routes
  router.use(standardRateLimiter);

  // Enhanced analytics endpoints with time filtering
  // Protected with auth + ownership verification
  router.get('/analytics/summary/:userId', allowGuestMode, verifyOwnership, resolveUser, async (req, res) => {
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

  router.get('/analytics/categories/:userId', allowGuestMode, verifyOwnership, resolveUser, async (req, res) => {
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

  router.get('/analytics/trends/:userId', allowGuestMode, verifyOwnership, resolveUser, async (req, res) => {
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

  router.get('/analytics/patterns/:userId', allowGuestMode, verifyOwnership, resolveUser, async (req, res) => {
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

  router.get('/analytics/top-categories/:userId', allowGuestMode, verifyOwnership, resolveUser, async (req, res) => {
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

  // Usage is counted by CreateTransactionUseCase, once per created transaction — a route-level
  // increment here counted every POST twice.
  // The record is the signed-in user's (FT-162): the body's userId is never read as the owner. The Mini App's outbox
  // still sends one; it must be the signed-in user's Telegram id (verifyOwnership: someone else's is 403, checked
  // before anything is resolved), and the owner is then taken from authentication.
  if (userModule) {
    router.post('/', requireAuth, verifyOwnership, createResolveCurrentUserMiddleware(userModule), async (req, res) => {
      try {
        // Validate input using our new validation system
        const validationResult = TransactionValidator.validate({ ...req.body, userId: currentUserId(req) });

        if (!validationResult.success) {
          // Return validation errors in standardized format
          const validationError = ErrorFactory.validation(
            `Validation failed: ${validationResult.error.map(e => e.message).join(', ')}`
          );
          return handleControllerError(validationError, res);
        }

        const transaction = validationResult.data;
        // A repeat of a clientId the user already sent answers 200 with that record, deleted or not (FT-106)
        let repeat: Transaction | undefined;
        const createResult = await createUseCase.execute(transaction, { onRepeat: existing => { repeat = existing; } });

        if (!createResult.success) {
          return handleControllerError(createResult.error, res);
        }

        if (repeat) {
          return handleControllerSuccess({ id: repeat.id, transaction: repeat, repeated: true }, res, 200);
        }
        handleControllerSuccess(
          { id: createResult.data, transaction },
          res,
          201,
          SUCCESS_MESSAGES.TRANSACTION_CREATED
        );
      } catch (error) {
        handleControllerError(error, res);
      }
    });
  }

  // History with search and filters (FT-107): the user from authentication, never from the query.
  // Replaces the admin list of everyone's records. The iOS app reads it with its token (FT-218).
  if (userModule) {
    router.get('/', ...createCurrentUserOrAppTokenMiddleware(userModule), async (req, res) => {
      try {
        const result = await historyUseCase.execute({ userId: currentUserId(req), query: req.query as Record<string, unknown> });
        if (!result.success) return handleControllerError(result.error, res);
        handleControllerSuccess(result.data, res);
      } catch (error) {
        handleControllerError(error, res);
      }
    });
  }

  // Income and expenses of a period through the one totals service (FT-111: the month tiles on Home).
  // The user from authentication; registered before /:id so «totals» is not read as a record id.
  if (userModule && periodTotalsUseCase) {
    router.get('/totals', ...createCurrentUserMiddleware(userModule), async (req, res) => {
      try {
        const result = await periodTotalsUseCase.execute({ userId: currentUserId(req), query: req.query as Record<string, unknown> });
        if (!result.success) return handleControllerError(result.error, res);
        handleControllerSuccess(result.data, res);
      } catch (error) {
        handleControllerError(error, res);
      }
    });
  }

  // The user's frequent expenses for the quick chips over the composer (FT-114). The user from
  // authentication; registered before /:id so «frequent» is not read as a record id.
  if (userModule && frequentRecordsUseCase) {
    router.get('/frequent', ...createCurrentUserMiddleware(userModule), async (req, res) => {
      try {
        const result = await frequentRecordsUseCase.execute({ userId: currentUserId(req) });
        if (!result.success) return handleControllerError(result.error, res);
        handleControllerSuccess(result.data, res);
      } catch (error) {
        handleControllerError(error, res);
      }
    });
  }

  router.get('/user/:userId', allowGuestMode, verifyOwnership, resolveUser, async (req, res) => {
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
  router.get('/:id', optionalAuth, async (req, res) => {
    try {
      const transactionId = getStringParam(req, 'id');

      if (!transactionId) {
        const error = ErrorFactory.validation('Transaction ID is required');
        return handleControllerError(error, res);
      }

      // Verify ownership before returning transaction
      const ownershipResult = await verifyTransactionOwnershipWithResult(req, transactionId, getByIdUseCase, userModule);
      if (!ownershipResult.success) {
        return handleControllerError(ownershipResult.error, res);
      }

      handleControllerSuccess(ownershipResult.transaction, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  // The iOS app deletes, restores and changes the category of its owner's records with its token (FT-218)
  router.delete('/:id', optionalAuthOrAppToken, async (req, res) => {
    try {
      const transactionId = getStringParam(req, 'id');

      if (!transactionId) {
        const error = ErrorFactory.validation('Transaction ID is required');
        return handleControllerError(error, res);
      }

      // Verify ownership before deleting
      const ownershipResult = await verifyTransactionOwnershipWithResult(req, transactionId, getByIdUseCase, userModule);
      if (!ownershipResult.success) {
        return handleControllerError(ownershipResult.error, res);
      }

      const deleteResult = await deleteUseCase.execute({ id: transactionId });
      if (!deleteResult.success) {
        return handleControllerError(deleteResult.error, res);
      }

      // Deleted softly (FT-105): POST /:id/restore brings it back
      handleControllerSuccess(
        { message: SUCCESS_MESSAGES.TRANSACTION_DELETED, id: transactionId },
        res,
        200,
        SUCCESS_MESSAGES.TRANSACTION_DELETED
      );
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  if (restoreUseCase) {
    /** «Отменить» after a delete (FT-105): the record comes back to lists, balances and totals. */
    router.post('/:id/restore', optionalAuthOrAppToken, async (req, res) => {
      try {
        const transactionId = getStringParam(req, 'id');
        if (!transactionId) {
          return handleControllerError(ErrorFactory.validation('Transaction ID is required'), res);
        }

        const ownershipResult = await verifyTransactionOwnershipWithResult(
          req, transactionId, getByIdUseCase, userModule, { includeDeleted: true }
        );
        if (!ownershipResult.success) {
          return handleControllerError(ownershipResult.error, res);
        }

        const result = await restoreUseCase.execute({ id: transactionId });
        if (!result.success) return handleControllerError(result.error, res);
        handleControllerSuccess(result.data, res);
      } catch (error) {
        handleControllerError(error, res);
      }
    });
  }

  router.put('/:id', optionalAuthOrAppToken, async (req, res) => {
    try {
      const transactionId = getStringParam(req, 'id');

      if (!transactionId) {
        const error = ErrorFactory.validation('Transaction ID is required');
        return handleControllerError(error, res);
      }

      // Verify ownership before updating
      const ownershipResult = await verifyTransactionOwnershipWithResult(req, transactionId, getByIdUseCase, userModule);
      if (!ownershipResult.success) {
        return handleControllerError(ownershipResult.error, res);
      }

      // Validate the update data - allow partial updates
      const allowedFields = ['amount', 'amountMinor', 'category', 'categoryId', 'accountId', 'currency', 'description', 'date', 'type', 'semanticType', 'needsReview', 'merchant'];
      const updates: Record<string, unknown> = {};

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

      let updateResult;
      if (hasLearningContext) {
        logger.debug('Using learning-enabled update');
        // Use learning-enabled update
        updateResult = await updateWithLearningUseCase.execute({
          id: transactionId,
          ...updates,
          // The record's owner, verified above — never a userId the body names
          userId: ownershipResult.transaction.userId,
          originalText: req.body.originalText,
          originalParsing: req.body.originalParsing
        });
      } else {
        logger.debug('Using regular update (no learning context)');
        // Use regular update
        updateResult = await updateUseCase.execute({
          id: transactionId,
          ...updates
        });
      }

      if (!updateResult.success) {
        return handleControllerError(updateResult.error, res);
      }

      handleControllerSuccess(
        updateResult.data,
        res,
        200,
        SUCCESS_MESSAGES.TRANSACTION_UPDATED
      );
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  // Archive endpoints - require ownership verification
  router.post('/:id/archive', optionalAuth, async (req, res) => {
    try {
      const transactionId = getStringParam(req, 'id');

      if (!transactionId) {
        const error = ErrorFactory.validation('Transaction ID is required');
        return handleControllerError(error, res);
      }

      // Verify ownership before archiving
      const ownershipResult = await verifyTransactionOwnershipWithResult(req, transactionId, getByIdUseCase, userModule);
      if (!ownershipResult.success) {
        return handleControllerError(ownershipResult.error, res);
      }

      const archiveResult = await archiveUseCase.execute(transactionId);
      if (!archiveResult.success) {
        return handleControllerError(archiveResult.error, res);
      }

      handleControllerSuccess(
        { message: 'Transaction archived successfully' },
        res,
        200
      );
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  router.post('/:id/unarchive', optionalAuth, async (req, res) => {
    try {
      const transactionId = getStringParam(req, 'id');

      if (!transactionId) {
        const error = ErrorFactory.validation('Transaction ID is required');
        return handleControllerError(error, res);
      }

      // Verify ownership before unarchiving. The transaction is archived by
      // definition here, so the lookup has to include archived rows.
      const ownershipResult = await verifyTransactionOwnershipWithResult(
        req,
        transactionId,
        getByIdUseCase,
        userModule,
        { includeArchived: true }
      );
      if (!ownershipResult.success) {
        return handleControllerError(ownershipResult.error, res);
      }

      const unarchiveResult = await unarchiveUseCase.execute(transactionId);
      if (!unarchiveResult.success) {
        return handleControllerError(unarchiveResult.error, res);
      }

      handleControllerSuccess(
        { message: 'Transaction unarchived successfully' },
        res,
        200
      );
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  router.post('/archive/batch', optionalAuth, async (req, res) => {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        const error = ErrorFactory.validation('Array of transaction IDs is required');
        return handleControllerError(error, res);
      }

      // Verify ownership for ALL transactions before archiving any
      for (const transactionId of ids) {
        const ownershipResult = await verifyTransactionOwnershipWithResult(req, transactionId, getByIdUseCase, userModule);
        if (!ownershipResult.success) {
          return handleControllerError(ownershipResult.error, res);
        }
      }

      const result = await archiveMultipleUseCase.execute(ids);
      handleControllerSuccess(result, res, 200);
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  router.post('/archive/all/:userId', allowGuestMode, verifyOwnership, resolveUser, async (req, res) => {
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

  router.get('/archived/user/:userId', allowGuestMode, verifyOwnership, resolveUser, async (req, res) => {
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
