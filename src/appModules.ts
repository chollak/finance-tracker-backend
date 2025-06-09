import { OPENAI_API_KEY, NOTION_API_KEY, NOTION_DATABASE_ID } from './config';
import { NotionService } from './infrastructure/services/notionService';
import { TransactionModule } from './modules/transaction/transactionModule';
import { OpenAITranscriptionService } from './modules/voiceProcessing/infrastructure/openAITranscriptionService';
import { VoiceProcessingModule } from './modules/voiceProcessing/voiceProcessingModule';

export function createModules() {
  const notionService = new NotionService(NOTION_API_KEY, NOTION_DATABASE_ID);
  const transactionModule = TransactionModule.create(notionService);
  const openAIService = new OpenAITranscriptionService(OPENAI_API_KEY);
  const voiceModule = new VoiceProcessingModule(openAIService, transactionModule);

  return { notionService, transactionModule, openAIService, voiceModule };
}
