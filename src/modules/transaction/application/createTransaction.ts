// src/application/createTransaction.ts

import { Transaction } from '../domain/transactionEntity';
import { TransactionRepository } from '../domain/transactionRepository';
import { SubscriptionModule } from '../../subscription/subscriptionModule';
import { UserModule } from '../../user/userModule';

export class CreateTransactionUseCase {
    private primaryRepository: TransactionRepository;
    private subscriptionModule?: SubscriptionModule;
    private userModule?: UserModule;

    constructor(primaryRepository: TransactionRepository) {
        this.primaryRepository = primaryRepository;
    }

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

    async execute(transaction: Transaction): Promise<string> {
        try {
            const id = await this.primaryRepository.save(transaction);

            // Increment usage counter after successful save
            if (this.subscriptionModule && this.userModule && transaction.userId) {
                await this.incrementTransactionCount(transaction.userId);
            }

            return id;
        } catch (error) {
            console.error('Error creating transaction:', error);
            throw error;
        }
    }

    /**
     * Increment transaction count in usage limits
     * Resolves telegramId to UUID if needed
     */
    private async incrementTransactionCount(userId: string): Promise<void> {
        try {
            // Resolve userId to UUID (handles telegramId, UUID, and guest users)
            const user = await this.userModule!.getGetOrCreateUserUseCase().execute({
                telegramId: userId,
            });

            await this.subscriptionModule!.getIncrementUsageUseCase().execute({
                userId: user.id,
                limitType: 'transactions',
            });
        } catch (error) {
            // Log but don't fail the transaction creation
            console.error('Failed to increment transaction count:', error);
        }
    }
}
