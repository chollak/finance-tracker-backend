import { Transaction } from './../domain/transactionEntity';
// modules/transaction/interfaces/transactionController.ts
import { Router } from 'express';
import { TransactionModule } from '../transactionModule';
import { AnalyticsService } from '../application/analyticsService';


const router = Router();

const analyticsService = new AnalyticsService(TransactionModule.transactionRepository);

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
    const createTransactionUseCase = TransactionModule.getCreateTransactionUseCase();
    const { date, category, description, amount, type } = req.body;
    if (!date || !category || !description || !amount || !type) {
        res.status(400).json({ error: 'All fields are required' });
        return;
    }

    try {
        const transaction = { date, category, description, amount, type };
        await createTransactionUseCase.execute(transaction);
        res.status(201).send('Transaction created');
    } catch (error: any) {
        res.status(400).send(error.message);
    }
});

router.get('/', async (req, res) => {
    const getTransactionsUseCase = TransactionModule.getGetTransactionsUseCase();

    try {
        const transactions = await getTransactionsUseCase.execute();
        res.status(200).json(transactions);
    } catch (error: any) {
        res.status(400).send(error.message);
    }
});

export default router;

