import express, { Request, Router } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { TransactionModule } from '../../modules/transaction/transactionModule';
import { VoiceProcessingModule } from '../../modules/voiceProcessing/voiceProcessingModule';
import { BudgetModule } from '../../modules/budget/budgetModule';
import { createTransactionRouter } from '../../modules/transaction/interfaces/transactionController';
import { createVoiceProcessingRouter } from '../../modules/voiceProcessing/voiceProcessingController';
import { createBudgetRouter } from '../../modules/budget/interfaces/budgetRoutes';
import { createDashboardRouter } from '../../shared/routes/dashboardRoutes';
import { 
  errorHandler, 
  notFoundHandler, 
  requestLogger, 
  corsHeaders, 
  securityHeaders 
} from '../../shared/middleware/errorMiddleware';
import { AppConfig } from '../../config/appConfig';

export function buildServer(
  transactionModule: TransactionModule,
  voiceModule: VoiceProcessingModule,
  budgetModule: BudgetModule
) {
  const router = Router();
  
  // Apply middleware in correct order
  router.use(requestLogger);
  router.use(securityHeaders);
  router.use(corsHeaders);
  router.use(bodyParser.json({ limit: '10mb' }));
  router.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
  router.use(cors<Request>());

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
      transactionModule.getDeleteTransactionUseCase(),
      transactionModule.getUpdateTransactionUseCase(),
      transactionModule.getUpdateTransactionWithLearningUseCase()
    )
  );

  router.use(
    '/voice',
    createVoiceProcessingRouter(
      voiceModule.getProcessVoiceInputUseCase(),
      voiceModule.getProcessTextInputUseCase()
    )
  );

  router.use(
    '/budgets',
    createBudgetRouter(budgetModule)
  );

  router.use(
    '/dashboard',
    createDashboardRouter(
      transactionModule.getAnalyticsService(),
      budgetModule.budgetService
    )
  );

  // Add 404 handler for unmatched routes
  router.use('*', notFoundHandler);
  
  // Add global error handler (must be last)
  router.use(errorHandler);

  return router;
}
