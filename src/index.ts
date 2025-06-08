import './config';
import { buildServer } from './framework/express/expressServer';
import { OPENAI_API_KEY, NOTION_API_KEY, NOTION_DATABASE_ID } from './config';
import { NotionService } from './infrastructure/services/notionService';
import { TransactionModule } from './modules/transaction/transactionModule';
import { OpenAITranscriptionService } from './modules/voiceProcessing/infrastructure/openAITranscriptionService';
import { VoiceProcessingModule } from './modules/voiceProcessing/voiceProcessingModule';
import { startTelegramBot } from './framework/telegram/telegramBot';

const app = buildServer();
const port = process.env.PORT || 3000;

const notionService = new NotionService(NOTION_API_KEY, NOTION_DATABASE_ID);
const transactionModule = TransactionModule.create(notionService);
const openAIService = new OpenAITranscriptionService(OPENAI_API_KEY);
const voiceModule = new VoiceProcessingModule(openAIService, transactionModule);
startTelegramBot(voiceModule);

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
