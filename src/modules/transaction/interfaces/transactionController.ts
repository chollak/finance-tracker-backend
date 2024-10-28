import { Transaction } from './../domain/transactionEntity';
// modules/transaction/interfaces/transactionController.ts
import { Router } from 'express';
import { TransactionModule } from '../transactionModule';

const router = Router();

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

