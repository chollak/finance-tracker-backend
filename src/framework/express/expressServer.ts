import express, { Request } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { TransactionModule } from '../../modules/transaction/transactionModule';
import { VoiceProcessingModule } from '../../modules/voiceProcessing/voiceProcessingModule';
import { createTransactionRouter } from '../../modules/transaction/interfaces/transactionController';
import { createVoiceProcessingRouter } from '../../modules/voiceProcessing/voiceProcessingController';
import { OpenAIModerationService } from '../../infrastructure/openai/OpenAIModerationService';
import createModerationMiddleware from './middleware/moderation';
import path from 'path';

export function buildServer(
  transactionModule: TransactionModule,
  voiceModule: VoiceProcessingModule,
  moderationService: OpenAIModerationService
) {
  const app = express();
  app.use(bodyParser.json());
  app.use(cors<Request>());
  app.use(createModerationMiddleware(moderationService));

  const publicDir = path.join(__dirname, '../../public');
  app.use('/webapp', express.static(publicDir));


  app.use(
    '/transactions',
    createTransactionRouter(
      transactionModule.getCreateTransactionUseCase(),
      transactionModule.getGetTransactionsUseCase(),
      transactionModule.getAnalyticsService(),
      transactionModule.getGetUserTransactionsUseCase()
    )
  );

  app.use(
    '/voice',
    createVoiceProcessingRouter(
      voiceModule.getProcessVoiceInputUseCase(),
      voiceModule.getProcessTextInputUseCase()
    )
  );

  return app;
}
