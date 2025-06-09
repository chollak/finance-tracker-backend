import express, { Request } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { TransactionModule } from '../../modules/transaction/transactionModule';
import { VoiceProcessingModule } from '../../modules/voiceProcessing/voiceProcessingModule';
import { createTransactionRouter } from '../../modules/transaction/interfaces/transactionController';
import { createVoiceProcessingRouter } from '../../modules/voiceProcessing/voiceProcessingController';

export function buildServer(
  transactionModule: TransactionModule,
  voiceModule: VoiceProcessingModule
) {
  const app = express();
  app.use(bodyParser.json());
  app.use(cors<Request>());


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
