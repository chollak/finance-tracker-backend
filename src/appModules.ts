import { AppConfig } from './shared/infrastructure/config/appConfig';
import { TransactionModule } from './modules/transaction/transactionModule';
import { OpenAITranscriptionService } from './modules/voiceProcessing/infrastructure/openAITranscriptionService';
import { VoiceProcessingModule } from './modules/voiceProcessing/voiceProcessingModule';
import { BudgetModule } from './modules/budget/budgetModule';
import { DebtModule } from './modules/debt/debtModule';
import { createOpenAIUsageModule } from './modules/openai-usage/openAIUsageModule';
import { UserModule } from './modules/user/userModule';

export function createModules() {
  const transactionModule = TransactionModule.create();
  const budgetModule = BudgetModule.create(transactionModule);
  const debtModule = DebtModule.create(transactionModule);
  const openAIService = new OpenAITranscriptionService(AppConfig.OPENAI_API_KEY);
  // VoiceProcessingModule now handles both transactions and debts
  const voiceModule = new VoiceProcessingModule(openAIService, transactionModule, debtModule);
  const openAIUsageModule = createOpenAIUsageModule();
  const userModule = UserModule.create();

  return { transactionModule, budgetModule, debtModule, voiceModule, openAIUsageModule, userModule };
}
