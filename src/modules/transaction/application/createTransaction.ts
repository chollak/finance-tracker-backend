// src/application/createTransaction.ts

import { Transaction } from '../domain/transactionEntity';
import { TransactionRepository } from '../domain/transactionRepository';
import { CategoryVectorRepository } from '../domain/categoryVectorRepository';

export class CreateTransactionUseCase {
    private primaryRepository: TransactionRepository;
    private categoryRepository: CategoryVectorRepository;

    constructor(primaryRepository: TransactionRepository, categoryRepository: CategoryVectorRepository) {
        this.primaryRepository = primaryRepository;
        this.categoryRepository = categoryRepository;
    }

    async execute(transaction: Transaction): Promise<void> {
        if (transaction.category === 'uncategorised') {
            const { category, score } = await this.categoryRepository.recommendCategory(transaction.description);
            if (score >= 0.85) {
                transaction.category = category;
            }
        }

        try {
            await this.primaryRepository.save(transaction);
        } catch (error) {
            console.error('Error with primary repository, falling back to secondary', error);
            // await this.fallbackRepository.save(transaction);
        }
    }
}
