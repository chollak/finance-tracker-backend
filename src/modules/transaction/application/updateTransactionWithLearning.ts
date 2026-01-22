import { Transaction } from '../domain/transactionEntity';
import { TransactionRepository } from '../domain/transactionRepository';
import { ErrorFactory } from '../../../shared/domain/errors/AppError';
import { Validators } from '../../../shared/application/validation/validators';
import { transactionLearning } from '../../../shared/application/learning/transactionLearning';
import { createLogger, LogCategory } from '../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.LEARNING);

export interface UpdateTransactionWithLearningRequest {
    id: string;
    amount?: number;
    category?: string;
    description?: string;
    date?: string;
    type?: 'income' | 'expense';
    merchant?: string;
    // Learning context
    userId?: string;
    originalText?: string;
    originalParsing?: {
        amount: number;
        category: string;
        type: 'income' | 'expense';
        merchant?: string;
        confidence?: number;
    };
}

export class UpdateTransactionWithLearningUseCase {
    constructor(private repository: TransactionRepository) {}

    async execute(request: UpdateTransactionWithLearningRequest): Promise<Transaction> {
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
            // Get original transaction for comparison
            const originalTransaction = await this.repository.findById(request.id.trim());
            if (!originalTransaction) {
                throw ErrorFactory.businessLogic('Transaction not found', { transactionId: request.id });
            }

            // Update the transaction
            const updatedTransaction = await this.repository.update(request.id.trim(), request);
            
            // Record learning data if we have the necessary context
            if (request.userId && request.originalText && request.originalParsing) {
                await this.recordLearningData(request, originalTransaction, updatedTransaction);
            }

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

    private async recordLearningData(
        request: UpdateTransactionWithLearningRequest,
        originalTransaction: Transaction,
        _updatedTransaction: Transaction
    ): Promise<void> {
        try {
            const userCorrection: any = {};
            
            // Detect what the user changed
            if (request.amount !== undefined && request.amount !== originalTransaction.amount) {
                userCorrection.amount = request.amount;
            }
            
            if (request.category !== undefined && request.category !== originalTransaction.category) {
                userCorrection.category = request.category;
            }
            
            if (request.type !== undefined && request.type !== originalTransaction.type) {
                userCorrection.type = request.type;
            }
            
            if (request.merchant !== undefined && request.merchant !== (originalTransaction as any).merchant) {
                userCorrection.merchant = request.merchant;
            }

            // Only record if there are actual corrections
            if (Object.keys(userCorrection).length > 0) {
                await transactionLearning.recordCorrection(
                    request.originalText!,
                    request.originalParsing!,
                    userCorrection,
                    request.userId!,
                    request.originalParsing!.confidence || 0.8
                );
                
                logger.info('Learning recorded for transaction update', {
                    transactionId: request.id,
                    corrections: Object.keys(userCorrection),
                    userId: request.userId?.substring(0, 8)
                });
            }
        } catch (error) {
            logger.error('Failed to record learning data', error as Error);
            // Don't throw - learning failure shouldn't break transaction updates
        }
    }
}