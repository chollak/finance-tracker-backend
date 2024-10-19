// src/application/createTransaction.ts
import { TransactionRepository } from '../../domain/repositories/transactionRepository';
import { Transaction } from '../../domain/entity/transaction';

export class CreateTransactionUseCase {
    private primaryRepository: TransactionRepository;
    private fallbackRepository: TransactionRepository;

    constructor(primaryRepository: TransactionRepository, fallbackRepository: TransactionRepository) {
        this.primaryRepository = primaryRepository;
        this.fallbackRepository = fallbackRepository;
    }

    async execute(transaction: Transaction): Promise<void> {
        try {
            await this.primaryRepository.save(transaction);
        } catch (error) {
            console.error('Error with primary repository, falling back to secondary', error);
            await this.fallbackRepository.save(transaction);
        }
    }
}
