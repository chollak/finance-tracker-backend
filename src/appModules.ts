import { AppConfig } from './shared/infrastructure/config/appConfig';
import { TransactionModule } from './modules/transaction/transactionModule';
import { OpenAITranscriptionService } from './modules/voiceProcessing/infrastructure/openAITranscriptionService';
import { VoiceProcessingModule } from './modules/voiceProcessing/voiceProcessingModule';
import { QuickCaptureModule } from './modules/quickCapture/quickCaptureModule';
import { BudgetModule } from './modules/budget/budgetModule';
import { DebtModule } from './modules/debt/debtModule';
import { createOpenAIUsageModule } from './modules/openai-usage/openAIUsageModule';
import { UserModule } from './modules/user/userModule';
import { SubscriptionModule } from './modules/subscription/subscriptionModule';
import { RepositoryFactory } from './shared/infrastructure/database/repositoryFactory';
import { CategoryModule } from './modules/category/categoryModule';
import { AccountModule } from './modules/account/accountModule';
import { FxModule } from './modules/fx/fxModule';

export function createModules() {
  // Core modules (no dependencies on subscription)
  const categoryModule = CategoryModule.create();
  const transactionModule = TransactionModule.create();
  // Records point at the user's categories (FT-099)
  transactionModule.setCategoryResolver(categoryModule.getCatalog());
  const budgetModule = BudgetModule.create(transactionModule);
  const userModule = UserModule.create();

  // Records are written to the user's accounts (FT-101); the default account comes from settings
  const accountModule = AccountModule.create();
  transactionModule.setAccountResolver(accountModule.getBook());
  accountModule.getBook().setDefaultAccountSource(userId => userModule.defaultAccountId(userId));
  userModule.setAccountCheck((userId, accountId) => accountModule.getBook().isVisibleAccount(userId, accountId));

  // USD rate (FT-102): the user's own rate from settings, else the Central Bank's
  const fxModule = FxModule.create({
    get: userId => userModule.ownUsdRate(userId),
    set: (userId, rate) => userModule.setOwnUsdRate(userId, rate),
  });
  accountModule.getBook().setRateProvider(fxModule.getService());
  transactionModule.setUsdRateSource(fxModule.getService());
  const openAIUsageModule = createOpenAIUsageModule();

  // Create SubscriptionModule with repositories
  const subscriptionRepository = RepositoryFactory.createSubscriptionRepository();
  const usageLimitRepository = RepositoryFactory.createUsageLimitRepository();
  const subscriptionModule = new SubscriptionModule(subscriptionRepository, usageLimitRepository, {
    freeLimitsEnabled: AppConfig.FREE_LIMITS_ENABLED,
  });

  // Set subscription dependencies for TransactionModule (for decrementing on delete)
  transactionModule.setSubscriptionDependencies(subscriptionModule, userModule);

  // DebtModule needs subscription for limit checking
  const debtModule = DebtModule.create(transactionModule, subscriptionModule, userModule);

  // VoiceProcessingModule now handles both transactions and debts
  const openAIService = new OpenAITranscriptionService(AppConfig.OPENAI_API_KEY);
  const voiceModule = new VoiceProcessingModule(openAIService, transactionModule, debtModule, categoryModule.getCatalog());

  // Shared quick-capture boundary: wraps the existing text pipeline for API/Telegram/Mini App clients
  const quickCaptureModule = QuickCaptureModule.create(voiceModule);

  return {
    categoryModule,
    accountModule,
    fxModule,
    transactionModule,
    budgetModule,
    debtModule,
    voiceModule,
    quickCaptureModule,
    openAIUsageModule,
    userModule,
    subscriptionModule,
  };
}
