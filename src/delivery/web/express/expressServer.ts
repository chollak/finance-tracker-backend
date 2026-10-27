import express, { Router } from 'express';
// Note: Using custom corsHeaders middleware instead of cors package for security
import { TransactionModule } from '../../../modules/transaction/transactionModule';
import { VoiceProcessingModule } from '../../../modules/voiceProcessing/voiceProcessingModule';
import { BudgetModule } from '../../../modules/budget/budgetModule';
import { DebtModule } from '../../../modules/debt/debtModule';
import { OpenAIUsageModule } from '../../../modules/openai-usage/openAIUsageModule';
import { UserModule } from '../../../modules/user/userModule';
import { SubscriptionModule } from '../../../modules/subscription/subscriptionModule';
import { QuickCaptureModule } from '../../../modules/quickCapture/quickCaptureModule';
import { createTransactionRouter } from '../../../modules/transaction/presentation/controllers/transactionController';
import { createAnalyticsRoutes } from '../../../modules/transaction/presentation/controllers/analyticsController';
import { createVoiceProcessingRouter } from '../../../modules/voiceProcessing/presentation/controllers/voiceProcessingController';
import { createQuickCaptureRouter } from '../../../modules/quickCapture/presentation/controllers/quickCaptureController';
import { createBudgetRouter } from '../../../modules/budget/interfaces/budgetRoutes';
import { createDebtRouter } from '../../../modules/debt/presentation/controllers/debtRoutes';
import { createDashboardRouter } from './routes/dashboardRoutes';
import { createUserController } from '../../../modules/user/presentation/controllers/userController';
import { createSettingsRoutes } from '../../../modules/user/presentation/controllers/settingsController';
import { CategoryModule } from '../../../modules/category/categoryModule';
import { createCategoryRoutes } from '../../../modules/category/presentation/categoryController';
import { AccountModule } from '../../../modules/account/accountModule';
import { createAccountRoutes } from '../../../modules/account/presentation/accountController';
import { createMoveRoutes } from '../../../modules/account/presentation/moveController';
import { FxModule } from '../../../modules/fx/fxModule';
import { createFxRoutes } from '../../../modules/fx/presentation/fxController';
import { ExportModule } from '../../../modules/export/exportModule';
import { createExportRoutes } from '../../../modules/export/presentation/exportController';
import { AuthModule } from '../../../modules/auth/authModule';
import { createAuthRoutes } from '../../../modules/auth/presentation/authController';
import { AuditModule } from '../../../modules/audit/auditModule';
import { createAuditRoutes, createGoalRoutes } from '../../../modules/audit/presentation/auditController';
import { createWebSessionMiddleware } from './middleware/webSessionMiddleware';
import { createAllowedUsersMiddleware } from './middleware/authMiddleware';

/** Modules of the money model (milestone 10, phase 2); their routes take the user from auth only. */
export interface MoneyModules {
  categoryModule?: CategoryModule;
  accountModule?: AccountModule;
  fxModule?: FxModule;
  /** «Скачать все записи» (FT-126). */
  exportModule?: ExportModule;
  /** Signing in to the web app through the bot and the browser's session cookie (FT-128). */
  authModule?: AuthModule;
  /** The spending audit and its goals (FT-131). */
  auditModule?: AuditModule;
}
import { createSubscriptionRoutes } from './routes/subscriptionRoutes';
import {
  errorHandler,
  notFoundHandler,
  requestLogger,
  corsHeaders,
  securityHeaders
} from './middleware/errorMiddleware';
import { getTelegramBotStatus } from '../../messaging/telegram/telegramBot';
import { createHealthHandler } from './routes/healthRoutes';

export function buildServer(
  transactionModule: TransactionModule,
  voiceModule: VoiceProcessingModule,
  budgetModule: BudgetModule,
  debtModule: DebtModule,
  openAIUsageModule: OpenAIUsageModule,
  userModule?: UserModule,
  subscriptionModule?: SubscriptionModule,
  // Kept last and optional: existing callers pass a subset of these positional arguments.
  quickCaptureModule?: QuickCaptureModule,
  moneyModules: MoneyModules = {}
) {
  const router = Router();
  
  // Apply middleware in correct order
  router.use(requestLogger);
  router.use(securityHeaders);
  router.use(corsHeaders);
  router.use(express.json({ limit: '10mb' }));
  router.use(express.urlencoded({ extended: true, limit: '10mb' }));
  // Note: Using custom corsHeaders middleware (applied above) for secure CORS handling

  // A browser signed in through the bot (FT-128): its session cookie, read before any route and rate limit
  const authModule = moneyModules.authModule;
  if (authModule) {
    router.use(createWebSessionMiddleware(sessionSecret => authModule.getWebSessionUseCase().execute({ sessionSecret })));
  }

  // Closed access (FT-153): someone not in ALLOWED_TELEGRAM_IDS gets 403 here, before any route resolves the user
  router.use(createAllowedUsersMiddleware());

  // Note: User resolution middleware is applied at route level, not globally.
  // This ensures req.params is available when middleware runs.
  // Each router receives userModule and applies middleware to routes with :userId param.

  // Health check: Docker, monitoring and the webapp's offline mode; 503 when the bot failed for good (FT-154)
  router.get('/health', createHealthHandler(getTelegramBotStatus));

  router.use(
    '/transactions',
    createTransactionRouter(
      transactionModule.getCreateTransactionUseCase(),
      transactionModule.getTransactionHistoryUseCase(),
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
      userModule,
      transactionModule.getRestoreTransactionUseCase(),
      transactionModule.getPeriodTotalsUseCase(),
      transactionModule.getFrequentRecordsUseCase()
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

  // Public route: POST /api/quick-capture (the /api prefix is added in src/index.ts)
  if (quickCaptureModule) {
    router.use(
      '/quick-capture',
      createQuickCaptureRouter(quickCaptureModule.getQuickCaptureService(), userModule)
    );
  }

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
    // Milestone 10 routes take the user from authentication, never from the path
    router.use('/settings', createSettingsRoutes(userModule));
    if (moneyModules.categoryModule) {
      router.use('/categories', createCategoryRoutes(moneyModules.categoryModule, userModule));
    }
    if (moneyModules.accountModule) {
      router.use('/accounts', createAccountRoutes(moneyModules.accountModule, userModule));
      router.use('/moves', createMoveRoutes(moneyModules.accountModule, userModule));
    }
    if (moneyModules.fxModule) {
      router.use('/rates', createFxRoutes(moneyModules.fxModule.getService(), userModule));
    }
    // Web login through the bot and the browser's session (FT-128)
    if (authModule) {
      router.use('/auth', createAuthRoutes(authModule, userModule));
    }
    // All records as CSV: a download, or a file in the chat with the bot (FT-126)
    if (moneyModules.exportModule) {
      router.use('/export', createExportRoutes(moneyModules.exportModule, userModule));
    }
    // The spending audit of the month before and the goals it makes (FT-131)
    if (moneyModules.auditModule) {
      router.use('/audits', createAuditRoutes(moneyModules.auditModule, userModule));
      router.use('/goals', createGoalRoutes(moneyModules.auditModule, userModule));
    }
    // Analytics with fair comparison (FT-120); a category's analytics needs the user's categories
    const categoryAnalytics = transactionModule.getCategoryAnalyticsUseCase();
    if (categoryAnalytics) {
      router.use('/analytics', createAnalyticsRoutes(transactionModule.getMonthAnalyticsUseCase(), categoryAnalytics, userModule));
    }
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
