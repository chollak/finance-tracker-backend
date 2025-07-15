import { Telegraf, Markup } from 'telegraf';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { pipeline } from 'stream/promises';
import { TG_BOT_API_KEY, WEB_APP_URL, DOWNLOADS_DIR } from '../../config';
import { VoiceProcessingModule } from '../../modules/voiceProcessing/voiceProcessingModule';
import { TransactionModule } from '../../modules/transaction/transactionModule';

async function downloadFile(url: string, dest: string): Promise<string> {
  const dir = path.dirname(dest);
  await fs.promises.mkdir(dir, { recursive: true });

  const file = fs.createWriteStream(dest);

  return new Promise((resolve, reject) => {
    const handleError = async (err: Error) => {
      await fs.promises.unlink(dest).catch(() => {});
      reject(err);
    };

    file.on('error', handleError);

    https
      .get(url, async response => {
        try {
          await pipeline(response, file);
          resolve(dest);
        } catch (err) {
          handleError(err as Error);
        }
      })
      .on('error', handleError);
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

  // Ensure downloads directory exists
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

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
      const url = WEB_APP_URL ? `${WEB_APP_URL}/webapp/transactions.html?userId=${userId}` : undefined;
      for (const tx of result.transactions) {
        lastTx[userId] = tx.id;
        await ctx.reply(
          `Saved: ${result.text}\nAmount: ${fmt.format(tx.amount)}\nCategory: ${tx.category}\nType: ${tx.type}`,
          Markup.inlineKeyboard([
            [Markup.button.callback('Delete', `delete:${tx.id}`)],
            ...(url ? [[Markup.button.webApp('Open app', url)]] : [])
          ])
        );
      }
    } catch (err) {
      console.error('Error handling text message:', err);
      await ctx.reply('Failed to process message');
    }
  });

  bot.on('voice', async ctx => {
    const userId = String(ctx.from?.id ?? 'unknown');
    const userName = ctx.from?.first_name + ' ' + ctx.from?.last_name + ' ' + ctx.from?.username;
    const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
    if (!fs.existsSync(DOWNLOADS_DIR)) {
      fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
    }
    const filePath = path.join(DOWNLOADS_DIR, ctx.message.voice.file_id);
    try {
      await downloadFile(fileLink.href, filePath);
      const result = await voiceModule.getProcessVoiceInputUseCase().execute({ filePath, userId, userName });
      const url = WEB_APP_URL ? `${WEB_APP_URL}/webapp/transactions.html?userId=${userId}` : undefined;
      for (const tx of result.transactions) {
        lastTx[userId] = tx.id;
        await ctx.reply(
          `Saved: ${result.text}\nAmount: ${fmt.format(tx.amount)}\nCategory: ${tx.category}\nType: ${tx.type}`,
          Markup.inlineKeyboard([
            [Markup.button.callback('Delete', `delete:${tx.id}`)],
            ...(url ? [[Markup.button.webApp('Open app', url)]] : [])
          ])
        );
      }
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
