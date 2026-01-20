import { AppConfig } from './shared/infrastructure/config/appConfig';
import { TransactionModule } from './modules/transaction/transactionModule';
import { OpenAITranscriptionService } from './modules/voiceProcessing/infrastructure/openAITranscriptionService';
import { VoiceProcessingModule } from './modules/voiceProcessing/voiceProcessingModule';
import { BudgetModule } from './modules/budget/budgetModule';
import { DebtModule } from './modules/debt/debtModule';
import { createOpenAIUsageModule } from './modules/openai-usage/openAIUsageModule';
import { UserModule } from './modules/user/userModule';
import { SubscriptionModule } from './modules/subscription/subscriptionModule';
import { RepositoryFactory } from './shared/infrastructure/database/repositoryFactory';

export function createModules() {
  // Core modules (no dependencies on subscription)
  const transactionModule = TransactionModule.create();
  const budgetModule = BudgetModule.create(transactionModule);
  const userModule = UserModule.create();
  const openAIUsageModule = createOpenAIUsageModule();

  // Create SubscriptionModule with repositories
  const subscriptionRepository = RepositoryFactory.createSubscriptionRepository();
  const usageLimitRepository = RepositoryFactory.createUsageLimitRepository();
  const subscriptionModule = new SubscriptionModule(subscriptionRepository, usageLimitRepository);

  // DebtModule needs subscription for limit checking
  const debtModule = DebtModule.create(transactionModule, subscriptionModule, userModule);

  // VoiceProcessingModule now handles both transactions and debts
  const openAIService = new OpenAITranscriptionService(AppConfig.OPENAI_API_KEY);
  const voiceModule = new VoiceProcessingModule(openAIService, transactionModule, debtModule);

  return {
    transactionModule,
    budgetModule,
    debtModule,
    voiceModule,
    openAIUsageModule,
    userModule,
    subscriptionModule,
  };
}
