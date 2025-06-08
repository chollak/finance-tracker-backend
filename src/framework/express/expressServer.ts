import express, { Request } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import '../../config';
import { OPENAI_API_KEY, NOTION_API_KEY, NOTION_DATABASE_ID } from '../../config';
import { NotionService } from '../../infrastructure/services/notionService';
import { TransactionModule } from '../../modules/transaction/transactionModule';
import { createTransactionRouter } from '../../modules/transaction/interfaces/transactionController';
import { OpenAITranscriptionService } from '../../modules/voiceProcessing/infrastructure/openAITranscriptionService';
import { VoiceProcessingModule } from '../../modules/voiceProcessing/voiceProcessingModule';
import { createVoiceProcessingRouter } from '../../modules/voiceProcessing/voiceProcessingController';

export function buildServer() {
  const app = express();
  app.use(bodyParser.json());
  app.use(cors<Request>());

  const notionService = new NotionService(NOTION_API_KEY, NOTION_DATABASE_ID);
  const transactionModule = TransactionModule.create(notionService);

  const openAIService = new OpenAITranscriptionService(OPENAI_API_KEY);
  const voiceModule = new VoiceProcessingModule(openAIService, transactionModule);

  app.use(
    '/transactions',
    createTransactionRouter(
      transactionModule.getCreateTransactionUseCase(),
      transactionModule.getGetTransactionsUseCase(),
      transactionModule.getAnalyticsService()
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
