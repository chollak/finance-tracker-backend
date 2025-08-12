import { TransactionRepository } from '../domain/transactionRepository';
import { ErrorFactory } from '../../../shared/domain/errors/AppError';
import { Validators } from '../../../shared/application/validation/validators';

export class DeleteTransactionUseCase {
    constructor(private repository: TransactionRepository) {}

    async execute(id: string): Promise<void> {
        // Validate input
        const idValidation = Validators.required(id, 'id');
        if (!idValidation.success) {
            throw idValidation.error;
        }

        const stringValidation = Validators.string(id, 'id');
        if (!stringValidation.success) {
            throw stringValidation.error;
        }

        try {
            // Check if transaction exists by trying to delete it
            // Notion API will throw an error if the transaction doesn't exist
            await this.repository.delete(id.trim());
        } catch (error) {
            // If it's already our error, re-throw it
            if (error instanceof Error && error.name.includes('Error')) {
                throw error;
            }
            
            // Otherwise, wrap it in a business logic error
            throw ErrorFactory.businessLogic(
                'Failed to delete transaction. It may not exist or you may not have permission.',
                { transactionId: id }
            );
        }
    }
}
