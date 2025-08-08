import { AppConfig } from './config/appConfig';
import { TransactionModule } from './modules/transaction/transactionModule';
import { OpenAITranscriptionService } from './modules/voiceProcessing/infrastructure/openAITranscriptionService';
import { VoiceProcessingModule } from './modules/voiceProcessing/voiceProcessingModule';

export function createModules() {
  // Use SQLite instead of Notion for better scalability
  const transactionModule = TransactionModule.createWithSqlite();
  const openAIService = new OpenAITranscriptionService(AppConfig.OPENAI_API_KEY);
  const voiceModule = new VoiceProcessingModule(openAIService, transactionModule);

  return { transactionModule, openAIService, voiceModule };
}
