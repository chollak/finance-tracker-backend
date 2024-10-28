// src/application/createTransaction.ts

import { Transaction } from '../domain/transactionEntity';
import { TransactionRepository } from '../domain/transactionRepository';

export class CreateTransactionUseCase {
    private primaryRepository: TransactionRepository;

    constructor(primaryRepository: TransactionRepository) {
        this.primaryRepository = primaryRepository;
    }

    async execute(transaction: Transaction): Promise<void> {
        try {
            await this.primaryRepository.save(transaction);
        } catch (error) {
            console.error('Error with primary repository, falling back to secondary', error);
            // await this.fallbackRepository.save(transaction);
        }
    }
}
