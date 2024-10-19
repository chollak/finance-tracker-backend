import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';

import { NotionService } from './infrastructure/services/notionService';
import { LocalFileService } from './infrastructure/services/localFileService';

import { NotionRepository } from './infrastructure/persistence/notionRepository';
import { LocalFileRepository } from './infrastructure/persistence/localFileRepository';

import { TransactionController } from './interfaces/http/transactionController';
import { CreateTransactionUseCase } from './application/usecases/createTransaction';
import { GetTransactionsUseCase } from './application/usecases/getTransactions';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

// Инициализация сервисов
const notionService = new NotionService();
const localFileService = new LocalFileService();

// Инициализация репозиториев
const notionRepository = new NotionRepository(notionService);
const localFileRepository = new LocalFileRepository(localFileService);

// Инициализация use cases
const createTransactionUseCase = new CreateTransactionUseCase(notionRepository, localFileRepository);
const getTransactionsUseCase = new GetTransactionsUseCase(notionRepository);

// Инициализация контроллера
const transactionController = new TransactionController(createTransactionUseCase, getTransactionsUseCase);

// Маршрут для создания транзакции
app.post('/transactions', (req, res) => transactionController.createTransaction(req, res));
app.get('/transactions', (req, res) => transactionController.getTransactions(req, res));

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
