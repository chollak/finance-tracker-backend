import express, { Router } from 'express';
// Note: Using custom corsHeaders middleware instead of cors package for security
import { TransactionModule } from '../../../modules/transaction/transactionModule';
import { VoiceProcessingModule } from '../../../modules/voiceProcessing/voiceProcessingModule';
import { BudgetModule } from '../../../modules/budget/budgetModule';
import { DebtModule } from '../../../modules/debt/debtModule';
import { OpenAIUsageModule } from '../../../modules/openai-usage/openAIUsageModule';
import { UserModule } from '../../../modules/user/userModule';
import { SubscriptionModule } from '../../../modules/subscription/subscriptionModule';
import { createTransactionRouter } from '../../../modules/transaction/presentation/controllers/transactionController';
import { createVoiceProcessingRouter } from '../../../modules/voiceProcessing/presentation/controllers/voiceProcessingController';
import { createBudgetRouter } from '../../../modules/budget/interfaces/budgetRoutes';
import { createDebtRouter } from '../../../modules/debt/presentation/controllers/debtRoutes';
import { createDashboardRouter } from './routes/dashboardRoutes';
import { createUserController } from '../../../modules/user/presentation/controllers/userController';
import { createSubscriptionRoutes } from './routes/subscriptionRoutes';
import {
  errorHandler,
  notFoundHandler,
  requestLogger,
  corsHeaders,
  securityHeaders
} from './middleware/errorMiddleware';
import { createUserResolutionMiddleware } from './middleware/userResolutionMiddleware';
import { AppConfig } from '../../../shared/infrastructure/config/appConfig';

export function buildServer(
  transactionModule: TransactionModule,
  voiceModule: VoiceProcessingModule,
  budgetModule: BudgetModule,
  debtModule: DebtModule,
  openAIUsageModule: OpenAIUsageModule,
  userModule?: UserModule,
  subscriptionModule?: SubscriptionModule
) {
  const router = Router();
  
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

  router.use(
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

  router.use(
    '/voice',
    createVoiceProcessingRouter(
      voiceModule.getProcessVoiceInputUseCase(),
      voiceModule.getProcessTextInputUseCase(),
      userModule
    )
  );

  router.use(
    '/budgets',
    createBudgetRouter(budgetModule, userModule)
  );

  router.use(
    '/debts',
    createDebtRouter(debtModule, userModule)
  );

  router.use(
    '/dashboard',
    createDashboardRouter(
      transactionModule.getAnalyticsService(),
      budgetModule.budgetService,
      subscriptionModule,
      userModule
    )
  );

  router.use(
    '/openai',
    openAIUsageModule.routes
  );

  // User routes (optional - only if userModule is provided)
  if (userModule) {
    router.use(
      '/users',
      createUserController(userModule)
    );
  }

  // Subscription routes (optional - only if both modules are provided)
  if (subscriptionModule && userModule) {
    router.use(
      '/subscription',
      createSubscriptionRoutes(subscriptionModule, userModule)
    );
  }

  // Add 404 handler for unmatched routes
  router.use('*', notFoundHandler);
  
  // Add global error handler (must be last)
  router.use(errorHandler);

  return router;
}
