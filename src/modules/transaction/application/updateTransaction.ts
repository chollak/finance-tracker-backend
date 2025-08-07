import { Transaction } from '../domain/transactionEntity';
import { TransactionRepository } from '../domain/transactionRepository';
import { ErrorFactory } from '../../../shared/errors/AppError';
import { Validators } from '../../../shared/validation/validators';

export interface UpdateTransactionRequest {
    id: string;
    amount?: number;
    category?: string;
    description?: string;
    date?: string;
    type?: 'income' | 'expense';
}

export class UpdateTransactionUseCase {
    constructor(private repository: TransactionRepository) {}

    async execute(request: UpdateTransactionRequest): Promise<Transaction> {
        // Validate ID
        const idValidation = Validators.required(request.id, 'id');
        if (!idValidation.success) {
            throw idValidation.error;
        }

        const stringValidation = Validators.string(request.id, 'id');
        if (!stringValidation.success) {
            throw stringValidation.error;
        }

        // Validate update fields if provided
        if (request.amount !== undefined) {
            const amountValidation = Validators.amount(request.amount);
            if (!amountValidation.success) {
                throw amountValidation.error;
            }
        }

        if (request.category !== undefined) {
            const categoryValidation = Validators.category(request.category);
            if (!categoryValidation.success) {
                throw categoryValidation.error;
            }
        }

        if (request.description !== undefined) {
            const descriptionValidation = Validators.string(request.description, 'description');
            if (!descriptionValidation.success) {
                throw descriptionValidation.error;
            }
        }

        if (request.date !== undefined) {
            const dateValidation = Validators.dateString(request.date, 'date');
            if (!dateValidation.success) {
                throw dateValidation.error;
            }
        }

        if (request.type !== undefined) {
            const typeValidation = Validators.transactionType(request.type);
            if (!typeValidation.success) {
                throw typeValidation.error;
            }
        }

        try {
            const updatedTransaction = await this.repository.update(request.id.trim(), request);
            return updatedTransaction;
        } catch (error) {
            if (error instanceof Error && error.name.includes('Error')) {
                throw error;
            }
            
            throw ErrorFactory.businessLogic(
                'Failed to update transaction. It may not exist or you may not have permission.',
                { transactionId: request.id, updateData: request }
            );
        }
    }
}