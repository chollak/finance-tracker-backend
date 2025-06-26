import { OPENAI_API_KEY, NOTION_API_KEY, NOTION_DATABASE_ID } from './config';
import { NotionService } from './infrastructure/services/notionService';
import { TransactionModule } from './modules/transaction/transactionModule';
import { CategoryVectorRepository } from './modules/categoryRecommendation/infrastructure/CategoryVectorRepository';
import { OpenAIEmbeddingService } from './infrastructure/openai/OpenAIEmbeddingService';
import { OpenAITranscriptionService } from './modules/voiceProcessing/infrastructure/openAITranscriptionService';
import { VoiceProcessingModule } from './modules/voiceProcessing/voiceProcessingModule';
import { OpenAIModerationService } from './infrastructure/openai/OpenAIModerationService';
import OpenAI from 'openai';

export function createModules() {
  const notionService = new NotionService(NOTION_API_KEY, NOTION_DATABASE_ID);
  const embeddingService = new OpenAIEmbeddingService(OPENAI_API_KEY);
  const categoryRepo = new CategoryVectorRepository({}, embeddingService);
  const transactionModule = TransactionModule.create(notionService, categoryRepo);
  const openAIService = new OpenAITranscriptionService(OPENAI_API_KEY);
  const voiceModule = new VoiceProcessingModule(openAIService, transactionModule);
  const openAIClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  const moderationService = new OpenAIModerationService(openAIClient);

  return { notionService, transactionModule, openAIService, voiceModule, moderationService };
}
