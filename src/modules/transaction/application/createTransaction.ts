// src/application/createTransaction.ts

import { Transaction } from '../domain/transactionEntity';
import { TransactionRepository } from '../domain/transactionRepository';
import { CategoryVectorRepository } from '../../categoryRecommendation/infrastructure/CategoryVectorRepository';

export class CreateTransactionUseCase {
    private primaryRepository: TransactionRepository;
    private categoryRepo: CategoryVectorRepository;

    constructor(primaryRepository: TransactionRepository, categoryRepo: CategoryVectorRepository) {
        this.primaryRepository = primaryRepository;
        this.categoryRepo = categoryRepo;
    }

    async execute(transaction: Transaction): Promise<void> {
        try {
            if (transaction.category === 'uncategorised') {
                const { label, score } = await this.categoryRepo.recommendCategory(transaction.description);
                if (score >= 0.85) {
                    transaction.category = label;
                }
            }
            await this.primaryRepository.save(transaction);
        } catch (error) {
            console.error('Error with primary repository, falling back to secondary', error);
            // await this.fallbackRepository.save(transaction);
        }
    }
}
