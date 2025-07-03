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

  const apiRouter = express.Router();

  apiRouter.use(
    '/transactions',
    createTransactionRouter(
      transactionModule.getCreateTransactionUseCase(),
      transactionModule.getGetTransactionsUseCase(),
      transactionModule.getAnalyticsService(),
      transactionModule.getGetUserTransactionsUseCase()
    )
  );

  apiRouter.use(
    '/voice',
    createVoiceProcessingRouter(
      voiceModule.getProcessVoiceInputUseCase(),
      voiceModule.getProcessTextInputUseCase()
    )
  );


  app.use('/api', apiRouter);

  // Serve the React web app from the root path. __dirname points to
  // "src/framework/express" in development and "dist/framework/express" in
  // production. We go three levels up to reach the project root, then into
  // "public/webapp".
  const webappDir = path.join(__dirname, '../../../public/webapp');
  app.use(express.static(webappDir));
  app.get('*', (_, res) => {
    res.sendFile(path.join(webappDir, 'index.html'));
  });

  return app;
}
