// src/application/getTransactions.ts

import { TransactionRepository } from '../../domain/repositories/transactionRepository';

export class GetTransactionsUseCase {
    private repository: TransactionRepository;

    constructor(repository: TransactionRepository) {
        this.repository = repository;
    }

    async execute(): Promise<any> {
        return this.repository.getAll();
    }
}
