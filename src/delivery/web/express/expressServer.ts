import express, { Router } from 'express';
// Note: Using custom corsHeaders middleware instead of cors package for security
import { TransactionModule } from '../../../modules/transaction/transactionModule';
import { VoiceProcessingModule } from '../../../modules/voiceProcessing/voiceProcessingModule';
import { UserModule } from '../../../modules/user/userModule';
import { SubscriptionModule } from '../../../modules/subscription/subscriptionModule';
import { createTransactionRouter } from '../../../modules/transaction/presentation/controllers/transactionController';
import { createVoiceProcessingRouter } from '../../../modules/voiceProcessing/presentation/controllers/voiceProcessingController';
import { createUserController } from '../../../modules/user/presentation/controllers/userController';
import {
  errorHandler,
  notFoundHandler,
  requestLogger,
  corsHeaders,
  securityHeaders
} from './middleware/errorMiddleware';
import { AppConfig } from '../../../shared/infrastructure/config/appConfig';
import { FROZEN_ROUTES, isRouteFrozen } from '../../../frozen';
import { createLogger, LogCategory } from '../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.SYSTEM);

/**
 * Маршруты из FROZEN_ROUTES (src/frozen.ts) намеренно не регистрируются.
 * Модули при этом продолжают конструироваться в appModules.ts — от них
 * зависят живые части, см. комментарий в src/frozen.ts.
 */
export function buildServer(
  transactionModule: TransactionModule,
  voiceModule: VoiceProcessingModule,
  userModule?: UserModule,
  subscriptionModule?: SubscriptionModule
) {
  const router = Router();

  // Список заморозки — исполняемый, а не комментарий: каждый регистрируемый путь
  // сверяется с ним, поэтому вернуть маршрут, забыв убрать его из FROZEN_ROUTES,
  // не получится молча.
  const register = (path: string, handler: Router): void => {
    if (isRouteFrozen(path)) {
      throw new Error(
        `Маршрут ${path} числится замороженным в src/frozen.ts, но его пытаются зарегистрировать. ` +
        'Убери путь из FROZEN_ROUTES, если размораживаешь осознанно.'
      );
    }
    router.use(path, handler);
  };

  logger.info('Заморожены маршруты', { routes: [...FROZEN_ROUTES] });

  // Apply middleware in correct order
  router.use(requestLogger);
  router.use(securityHeaders);
  router.use(corsHeaders);
  router.use(express.json({ limit: '10mb' }));
  router.use(express.urlencoded({ extended: true, limit: '10mb' }));
  // Note: Using custom corsHeaders middleware (applied above) for secure CORS handling

  // Note: User resolution middleware is applied at route level, not globally.
  // This ensures req.params is available when middleware runs.
  // Each router receives userModule and applies middleware to routes with :userId param.

  // Health check endpoint for Docker health monitoring
  router.get('/health', (_req, res) => {
    res.status(200).json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: AppConfig.NODE_ENV
    });
  });

  register(
    '/transactions',
    createTransactionRouter(
      transactionModule.getCreateTransactionUseCase(),
      transactionModule.getGetTransactionsUseCase(),
      transactionModule.getAnalyticsService(),
      transactionModule.getGetUserTransactionsUseCase(),
      transactionModule.getGetTransactionByIdUseCase(),
      transactionModule.getDeleteTransactionUseCase(),
      transactionModule.getUpdateTransactionUseCase(),
      transactionModule.getUpdateTransactionWithLearningUseCase(),
      transactionModule.getArchiveTransactionUseCase(),
      transactionModule.getUnarchiveTransactionUseCase(),
      transactionModule.getArchiveMultipleTransactionsUseCase(),
      transactionModule.getArchiveAllByUserUseCase(),
      transactionModule.getGetArchivedTransactionsUseCase(),
      subscriptionModule,
      userModule
    )
  );

  register(
    '/voice',
    createVoiceProcessingRouter(
      voiceModule.getProcessVoiceInputUseCase(),
      voiceModule.getProcessTextInputUseCase(),
      userModule
    )
  );





  // User routes (optional - only if userModule is provided)
  if (userModule) {
    register(
      '/users',
      createUserController(userModule)
    );
  }

  // Add 404 handler for unmatched routes
  router.use('*', notFoundHandler);
  
  // Add global error handler (must be last)
  router.use(errorHandler);

  return router;
}
