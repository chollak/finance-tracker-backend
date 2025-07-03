import './config';
import { buildServer } from './framework/express/expressServer';
import { startTelegramBot } from './framework/telegram/telegramBot';
import { createModules } from './appModules';

const { transactionModule, voiceModule } = createModules();
const app = buildServer(transactionModule, voiceModule);
const port = process.env.PORT || 3000;
startTelegramBot(voiceModule, transactionModule);

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
