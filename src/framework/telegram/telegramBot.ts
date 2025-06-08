import { Telegraf } from 'telegraf';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { TG_BOT_API_KEY } from '../../config';
import { VoiceProcessingModule } from '../../modules/voiceProcessing/voiceProcessingModule';

function downloadFile(url: string, dest: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, response => {
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve(dest)));
    }).on('error', err => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

export function startTelegramBot(module: VoiceProcessingModule) {
  if (!TG_BOT_API_KEY) {
    console.warn('TG_BOT_API_KEY is not set, Telegram bot disabled');
    return;
  }

  const bot = new Telegraf(TG_BOT_API_KEY);

  bot.on('text', async ctx => {
    const userId = String(ctx.from?.id ?? 'unknown');
    const userName = ctx.from?.first_name + ' ' + ctx.from?.last_name + ' ' + ctx.from?.username;
    const text = ctx.message.text;
    try {
      await module.getProcessTextInputUseCase().execute(text, userId, userName);
      await ctx.reply('Transaction saved');
    } catch (err) {
      console.error('Error handling text message:', err);
      await ctx.reply('Failed to process message');
    }
  });

  bot.on('voice', async ctx => {
    const userId = String(ctx.from?.id ?? 'unknown');
    const userName = ctx.from?.first_name + ' ' + ctx.from?.last_name + ' ' + ctx.from?.username;
    const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
    const filePath = path.join('downloads', ctx.message.voice.file_id);
    try {
      await downloadFile(fileLink.href, filePath);
      await module.getProcessVoiceInputUseCase().execute({ filePath, userId, userName });
      await ctx.reply('Transaction saved');
    } catch (err) {
      console.error('Error handling voice message:', err);
      await ctx.reply('Failed to process voice message');
    } finally {
      fs.unlink(filePath, () => { });
    }
  });

  bot.launch();
  console.log('Telegram bot started');
}
