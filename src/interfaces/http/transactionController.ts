// src/interfaces/transactionController.ts
import { GetTransactionsUseCase } from '../../application/usecases/getTransactions';
import { CreateTransactionUseCase } from '../../application/usecases/createTransaction';
import { Request, Response } from 'express';

export class TransactionController {
    private createTransactionUseCase: CreateTransactionUseCase;
    private getTransactionsUseCase: GetTransactionsUseCase;

    constructor(createTransactionUseCase: CreateTransactionUseCase, getTransactionsUseCase: GetTransactionsUseCase) {
        this.createTransactionUseCase = createTransactionUseCase;
        this.getTransactionsUseCase = getTransactionsUseCase;
    }

    async createTransaction(req: Request, res: Response): Promise<void> {
        const { date, category, description, amount, type } = req.body;
        if (!date || !category || !description || !amount || !type) {
            res.status(400).json({ error: 'All fields are required' });
            return;
        }

        const transaction = { date, category, description, amount, type };

        try {
            await this.createTransactionUseCase.execute(transaction);
            res.status(201).json({ message: 'Transaction created successfully' });
        } catch (error) {
            res.status(500).json({ error: 'Error creating transaction' });
        }
    }

    async getTransactions(req: Request, res: Response): Promise<void> {
        try {
            const transactions = await this.getTransactionsUseCase.execute();
            res.status(200).json(transactions);
        } catch (error) {
            console.log(error);
            res.status(500).json({ error: 'Error fetching transactions' });
        }
    }
}
