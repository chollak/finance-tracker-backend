import { TransactionRepository } from '../domain/transactionRepository';
import { ErrorFactory } from '../../../shared/domain/errors/AppError';
import { Validators } from '../../../shared/application/validation/validators';
import { SubscriptionModule } from '../../subscription/subscriptionModule';
import { UserModule } from '../../user/userModule';

export class DeleteTransactionUseCase {
    private subscriptionModule?: SubscriptionModule;
    private userModule?: UserModule;

    constructor(private repository: TransactionRepository) {}

    /**
     * Set subscription dependencies for usage tracking
     * Called after module initialization to avoid circular dependencies
     */
    setSubscriptionDependencies(
        subscriptionModule: SubscriptionModule,
        userModule: UserModule
    ): void {
        this.subscriptionModule = subscriptionModule;
        this.userModule = userModule;
    }

    async execute(id: string, userId?: string): Promise<void> {
        // Validate input
        const idValidation = Validators.required(id, 'id');
        if (!idValidation.success) {
            throw idValidation.error;
        }

        const stringValidation = Validators.string(id, 'id');
        if (!stringValidation.success) {
            throw stringValidation.error;
        }

        // Get transaction to know userId before deletion (for decrementing counter)
        let transactionUserId = userId;
        if (!transactionUserId) {
            const transaction = await this.repository.findById(id.trim());
            transactionUserId = transaction?.userId;
        }

        try {
            await this.repository.delete(id.trim());

            // Decrement usage counter after successful deletion
            if (transactionUserId && this.subscriptionModule && this.userModule) {
                await this.decrementTransactionCount(transactionUserId);
            }
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

    /**
     * Decrement transaction counter for user
     */
    private async decrementTransactionCount(telegramId: string): Promise<void> {
        try {
            // Resolve telegram_id to UUID
            const user = await this.userModule!.getGetOrCreateUserUseCase().execute({
                telegramId,
            });
            const userId = user.id;

            // Decrement counter (fire and forget - don't fail the main operation)
            await this.subscriptionModule!.getDecrementUsageUseCase().execute({
                userId,
                limitType: 'transactions',
            });
        } catch (error) {
            // Non-critical error - log but don't fail the deletion
            console.error('Error decrementing transaction count:', error);
        }
    }
}
