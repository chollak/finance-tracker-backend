import express, { Request } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import 'dotenv/config'

import transactionRoutes from './modules/transaction/interfaces/transactionController';
import voiceProcessingRoutes from './modules/voiceProcessing/voiceProcessingController';


const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(cors<Request>());

app.use('/transactions', transactionRoutes);
app.use('/voice', voiceProcessingRoutes);

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
