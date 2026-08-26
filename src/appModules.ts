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

  // ЗАМОРОЖЕНО 2026-08-26, см. src/frozen.ts.
  //
  // transactionModule.setSubscriptionDependencies(subscriptionModule, userModule);
  //
  // Не вызывается намеренно. Оба use case проверяют наличие зависимостей
  // (createTransaction.ts:56, deleteTransaction.ts:56), поэтому без этой строки
  // учёт лимитов просто не выполняется — код удалять не нужно.
  //
  // Помимо заморозки подписок это гасит подтверждённый баг: обе стороны учёта
  // вызывают getOrCreateUser({ telegramId: userId }), куда приходит уже
  // разрезолвленный UUID (messageHandlers.ts:141). Поиск промахивается, и
  // создаётся теневой пользователь с чужим UUID в поле telegram_id.
  // В data/database.sqlite таких три; у пары dbab93a0/258e010a счётчики
  // разошлись на 71 и 26. Проверка лимита читала одну строку, инкремент писал
  // в обе. Разморозку делать только вместе с починкой через resolveUserIdToUUID.

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
