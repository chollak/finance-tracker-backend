import { AppConfig } from './shared/infrastructure/config/appConfig';
import { TransactionModule } from './modules/transaction/transactionModule';
import { OpenAITranscriptionService } from './modules/voiceProcessing/infrastructure/openAITranscriptionService';
import { VoiceProcessingModule } from './modules/voiceProcessing/voiceProcessingModule';
import { BudgetModule } from './modules/budget/budgetModule';
import { createOpenAIUsageModule } from './modules/openai-usage/openAIUsageModule';
import { UserModule } from './modules/user/userModule';

export function createModules() {
  const transactionModule = TransactionModule.create();
  const budgetModule = BudgetModule.create(transactionModule);
  const openAIService = new OpenAITranscriptionService(AppConfig.OPENAI_API_KEY);
  const voiceModule = new VoiceProcessingModule(openAIService, transactionModule);
  const openAIUsageModule = createOpenAIUsageModule();
  const userModule = UserModule.create();

  return { transactionModule, budgetModule, voiceModule, openAIUsageModule, userModule };
}
