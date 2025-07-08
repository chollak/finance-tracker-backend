import './config';
import express from 'express';
import path from 'path';
import { buildServer } from './framework/express/expressServer';
import { startTelegramBot } from './framework/telegram/telegramBot';
import { createModules } from './appModules';

const { transactionModule, voiceModule } = createModules();
const app = express();

app.use('/api', buildServer(transactionModule, voiceModule));

const buildPath = path.join(__dirname, '../webapp/build');
app.use(express.static(buildPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

const port = process.env.PORT || 3000;
startTelegramBot(voiceModule, transactionModule);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
