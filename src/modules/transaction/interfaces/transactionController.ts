import { Router } from 'express';
import { CreateTransactionUseCase } from '../application/createTransaction';
import { GetTransactionsUseCase } from '../application/getTransactions';
import { AnalyticsService } from '../application/analyticsService';
import { Transaction } from '../domain/transactionEntity';

export function createTransactionRouter(
  createUseCase: CreateTransactionUseCase,
  getUseCase: GetTransactionsUseCase,
  analyticsService: AnalyticsService
): Router {
  const router = Router();

  router.get('/analytics', async (req, res) => {
    try {
      const summary = await analyticsService.getSummary();
      const categoryBreakdown = await analyticsService.getCategoryBreakdown();
      res.json({
        totalIncome: summary.totalIncome,
        totalExpense: summary.totalExpense,
        categoryBreakdown
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  router.post('/', async (req, res) => {
    const { date, category, description, amount, type } = req.body as Transaction;
    if (!date || !category || !description || !amount || !type) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }

    try {
      const transaction = { date, category, description, amount, type };
      await createUseCase.execute(transaction);
      res.status(201).send('Transaction created');
    } catch (error: any) {
      res.status(400).send(error.message);
    }
  });

  router.get('/', async (req, res) => {
    try {
      const transactions = await getUseCase.execute();
      res.status(200).json(transactions);
    } catch (error: any) {
      res.status(400).send(error.message);
    }
  });

  return router;
}
