import './config';
import { buildServer } from './framework/express/expressServer';
import { startTelegramBot } from './framework/telegram/telegramBot';
import { createModules } from './appModules';

const { transactionModule, voiceModule, moderationService } = createModules();
const app = buildServer(transactionModule, voiceModule, moderationService);
const port = process.env.PORT || 3000;
startTelegramBot(voiceModule);

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
