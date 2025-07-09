import { Telegraf, Markup } from 'telegraf';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { TG_BOT_API_KEY, WEB_APP_URL } from '../../config';
import { VoiceProcessingModule } from '../../modules/voiceProcessing/voiceProcessingModule';
import { TransactionModule } from '../../modules/transaction/transactionModule';

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

export function startTelegramBot(
  voiceModule: VoiceProcessingModule,
  transactionModule: TransactionModule
) {
  if (!TG_BOT_API_KEY) {
    console.warn('TG_BOT_API_KEY is not set, Telegram bot disabled');
    return;
  }

  const bot = new Telegraf(TG_BOT_API_KEY);
  const deleteUseCase = transactionModule.getDeleteTransactionUseCase();
  const fmt = new Intl.NumberFormat('ru-RU');
  const lastTx: Record<string, string> = {};

  bot.start(async ctx => {
    if (!WEB_APP_URL) {
      await ctx.reply('Web app URL not configured');
      return;
    }
    const userId = String(ctx.from?.id ?? 'unknown');
    const url = `${WEB_APP_URL}/webapp/transactions.html?userId=${userId}`;
    await ctx.reply(
      'Welcome! Open your transactions below.',
      Markup.inlineKeyboard([Markup.button.webApp('Open', url)])
    );
  });

  bot.command('transactions', async ctx => {
    if (!WEB_APP_URL) {
      await ctx.reply('Web app URL not configured');
      return;
    }
    const userId = String(ctx.from?.id ?? 'unknown');
    const url = `${WEB_APP_URL}/webapp/transactions.html?userId=${userId}`;
    await ctx.reply(
      'Open your transactions',
      Markup.inlineKeyboard([Markup.button.webApp('Open', url)])
    );
  });

  bot.on('text', async ctx => {
    const userId = String(ctx.from?.id ?? 'unknown');
    const userName = ctx.from?.first_name + ' ' + ctx.from?.last_name + ' ' + ctx.from?.username;
    const text = ctx.message.text;
    try {
      const result = await voiceModule.getProcessTextInputUseCase().execute(text, userId, userName);
      lastTx[userId] = result.id;
      const url = WEB_APP_URL ? `${WEB_APP_URL}/webapp/transactions.html?userId=${userId}` : undefined;
      await ctx.reply(
        `Saved: ${result.text}\nAmount: ${fmt.format(result.amount)}\nCategory: ${result.category}\nType: ${result.type}`,
        Markup.inlineKeyboard([
          [Markup.button.callback('Delete', `delete:${result.id}`)],
          ...(url ? [[Markup.button.webApp('Open app', url)] ] : [])
        ])
      );
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
      const result = await voiceModule.getProcessVoiceInputUseCase().execute({ filePath, userId, userName });
      lastTx[userId] = result.id;
      const url = WEB_APP_URL ? `${WEB_APP_URL}/webapp/transactions.html?userId=${userId}` : undefined;
      await ctx.reply(
        `Saved: ${result.text}\nAmount: ${fmt.format(result.amount)}\nCategory: ${result.category}\nType: ${result.type}`,
        Markup.inlineKeyboard([
          [Markup.button.callback('Delete', `delete:${result.id}`)],
          ...(url ? [[Markup.button.webApp('Open app', url)] ] : [])
        ])
      );
    } catch (err) {
      console.error('Error handling voice message:', err);
      await ctx.reply('Failed to process voice message');
    } finally {
      fs.unlink(filePath, () => { });
    }
  });

  bot.action(/delete:(.+)/, async ctx => {
    const id = ctx.match[1];
    const userId = String(ctx.from?.id ?? 'unknown');
    if (lastTx[userId] !== id) {
      await ctx.answerCbQuery('Cannot delete this transaction');
      return;
    }
    try {
      await deleteUseCase.execute(id);
      lastTx[userId] = '';
      // Remove inline keyboard after deletion
      await ctx.editMessageReplyMarkup(undefined);
      await ctx.answerCbQuery('Deleted');
    } catch (err) {
      console.error('Error deleting transaction:', err);
      await ctx.answerCbQuery('Failed to delete');
    }
  });

  bot.launch();
  console.log('Telegram bot started');
}
