import express, { Request } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { TransactionModule } from '../../modules/transaction/transactionModule';
import { VoiceProcessingModule } from '../../modules/voiceProcessing/voiceProcessingModule';
import { createTransactionRouter } from '../../modules/transaction/interfaces/transactionController';
import { createVoiceProcessingRouter } from '../../modules/voiceProcessing/voiceProcessingController';
import path from 'path';

export function buildServer(
  transactionModule: TransactionModule,
  voiceModule: VoiceProcessingModule
) {
  const app = express();
  app.use(bodyParser.json());
  app.use(cors<Request>());

  // Serve static files from the project root "public" directory.
  // __dirname points to "src/framework/express" in development and
  // "dist/framework/express" in production. In both cases we need to
  // go three levels up to reach the project root.
  const publicDir = path.join(__dirname, '../../../public');
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
