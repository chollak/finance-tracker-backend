import { Telegraf, Markup } from 'telegraf';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { pipeline } from 'stream/promises';
import { AppConfig } from '../../config/appConfig';
import { ErrorFactory, AppError } from '../../shared/errors/AppError';
import { ERROR_MESSAGES } from '../../shared/constants/messages';
import { VoiceProcessingModule } from '../../modules/voiceProcessing/voiceProcessingModule';
import { TransactionModule } from '../../modules/transaction/transactionModule';

async function downloadFile(url: string, dest: string): Promise<string> {
  try {
    const dir = path.dirname(dest);
    await fs.promises.mkdir(dir, { recursive: true });

    const file = fs.createWriteStream(dest);

    return new Promise((resolve, reject) => {
      const handleError = async (err: Error) => {
        try {
          await fs.promises.unlink(dest).catch(() => { });
        } catch (cleanupErr) {
          console.warn('Failed to cleanup file after download error:', cleanupErr);
        }
        reject(ErrorFactory.externalService('File Download', err));
      };

      file.on('error', handleError);

      https
        .get(url, async response => {
          try {
            if (response.statusCode !== 200) {
              throw new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`);
            }
            
            await pipeline(response, file);
            resolve(dest);
          } catch (err) {
            handleError(err as Error);
          }
        })
        .on('error', handleError);
    });
  } catch (error) {
    throw ErrorFactory.externalService('File Download Setup', error instanceof Error ? error : undefined);
  }
}

export function startTelegramBot(
  voiceModule: VoiceProcessingModule,
  transactionModule: TransactionModule
) {
  try {
    if (!AppConfig.TG_BOT_API_KEY) {
      console.warn('TG_BOT_API_KEY is not set, Telegram bot disabled');
      return;
    }

    const bot = new Telegraf(AppConfig.TG_BOT_API_KEY);
    const deleteUseCase = transactionModule.getDeleteTransactionUseCase();
    const fmt = new Intl.NumberFormat('ru-RU');
    const lastTx: Record<string, string> = {};

    // Ensure downloads directory exists
    const downloadsDir = path.resolve(AppConfig.DOWNLOADS_PATH);
    fs.mkdirSync(downloadsDir, { recursive: true });

    bot.catch((err, ctx) => {
      console.error('Telegram bot error:', {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        userId: ctx?.from?.id,
        updateType: ctx?.updateType
      });
      
      // Try to send error message to user if context is available
      if (ctx && ctx.reply) {
        ctx.reply('Sorry, something went wrong. Please try again.')
          .catch(replyErr => console.error('Failed to send error message:', replyErr));
      }
    });

    bot.start(async ctx => {
      try {
        if (!AppConfig.WEB_APP_URL) {
          await ctx.reply('Web app URL not configured');
          return;
        }
        
        const userId = String(ctx.from?.id ?? 'unknown');
        const url = `${AppConfig.WEB_APP_URL}/webapp/transactions.html?userId=${userId}`;
        
        await ctx.reply(
          'Welcome! Open your transactions below.',
          Markup.inlineKeyboard([Markup.button.webApp('Open', url)])
        );
      } catch (error) {
        console.error('Error in /start command:', error);
        await ctx.reply('Welcome! Sorry, there was an issue setting up the app.');
      }
    });

    bot.command('transactions', async ctx => {
      try {
        if (!AppConfig.WEB_APP_URL) {
          await ctx.reply('Web app URL not configured');
          return;
        }
        
        const userId = String(ctx.from?.id ?? 'unknown');
        const url = `${AppConfig.WEB_APP_URL}/webapp/transactions.html?userId=${userId}`;
        
        await ctx.reply(
          'Open your transactions',
          Markup.inlineKeyboard([Markup.button.webApp('Open', url)])
        );
      } catch (error) {
        console.error('Error in /transactions command:', error);
        await ctx.reply('Sorry, failed to open transactions. Please try again.');
      }
    });

    bot.on('text', async ctx => {
      const userId = String(ctx.from?.id ?? 'unknown');
      const userName = `${ctx.from?.first_name || ''} ${ctx.from?.last_name || ''} ${ctx.from?.username || ''}`.trim();
      const text = ctx.message.text;
      
      try {
        if (!text || text.trim().length === 0) {
          await ctx.reply('Please send a valid transaction message.');
          return;
        }

        const result = await voiceModule.getProcessTextInputUseCase().execute(text, userId, userName);
        
        if (result.transactions.length === 0) {
          await ctx.reply('No transactions found in your message. Please try describing a transaction.');
          return;
        }

        const url = AppConfig.WEB_APP_URL ? `${AppConfig.WEB_APP_URL}/webapp/transactions.html?userId=${userId}` : undefined;
        
        for (const tx of result.transactions) {
          lastTx[userId] = tx.id;
          await ctx.reply(
            `✅ Saved: ${result.text}\nAmount: ${fmt.format(tx.amount)}\nCategory: ${tx.category}\nType: ${tx.type}`,
            Markup.inlineKeyboard([
              [Markup.button.callback('🗑️ Delete', `delete:${tx.id}`)],
              ...(url ? [[Markup.button.webApp('📊 Open app', url)]] : [])
            ])
          );
        }
      } catch (error) {
        console.error('Error handling text message:', {
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined,
          userId,
          text: text?.substring(0, 100) // Log first 100 chars for debugging
        });
        
        if (error instanceof AppError) {
          await ctx.reply(`❌ ${error.message}`);
        } else {
          await ctx.reply('❌ Failed to process your message. Please try again or contact support.');
        }
      }
    });

    bot.on('voice', async ctx => {
      const userId = String(ctx.from?.id ?? 'unknown');
      const userName = `${ctx.from?.first_name || ''} ${ctx.from?.last_name || ''} ${ctx.from?.username || ''}`.trim();
      let filePath: string | undefined;
      
      try {
        // Get file link from Telegram
        const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
        
        if (!fileLink || !fileLink.href) {
          throw ErrorFactory.externalService('Telegram API', new Error('Failed to get voice file link'));
        }

        // Ensure downloads directory exists
        if (!fs.existsSync(downloadsDir)) {
          fs.mkdirSync(downloadsDir, { recursive: true });
        }

        filePath = path.join(downloadsDir, ctx.message.voice.file_id);
        
        // Download voice file
        await downloadFile(fileLink.href, filePath);
        
        // Process voice input
        const result = await voiceModule.getProcessVoiceInputUseCase().execute({ 
          filePath, 
          userId, 
          userName 
        });
        
        if (result.transactions.length === 0) {
          await ctx.reply('🎤 Voice processed, but no transactions found. Please try describing a transaction clearly.');
          return;
        }

        const url = AppConfig.WEB_APP_URL ? `${AppConfig.WEB_APP_URL}/webapp/transactions.html?userId=${userId}` : undefined;
        
        for (const tx of result.transactions) {
          lastTx[userId] = tx.id;
          await ctx.reply(
            `🎤✅ Saved: ${result.text}\nAmount: ${fmt.format(tx.amount)}\nCategory: ${tx.category}\nType: ${tx.type}`,
            Markup.inlineKeyboard([
              [Markup.button.callback('🗑️ Delete', `delete:${tx.id}`)],
              ...(url ? [[Markup.button.webApp('📊 Open app', url)]] : [])
            ])
          );
        }
      } catch (error) {
        console.error('Error handling voice message:', {
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined,
          userId,
          fileId: ctx.message.voice.file_id
        });
        
        if (error instanceof AppError) {
          await ctx.reply(`🎤❌ ${error.message}`);
        } else {
          await ctx.reply('🎤❌ Failed to process your voice message. Please try again or send as text.');
        }
      } finally {
        // Clean up downloaded file
        if (filePath) {
          fs.unlink(filePath, (err) => {
            if (err) {
              console.warn('Failed to cleanup voice file:', err);
            }
          });
        }
      }
    });

    bot.action(/delete:(.+)/, async ctx => {
      try {
        const id = ctx.match?.[1];
        if (!id) {
          await ctx.answerCbQuery('❌ Invalid transaction ID');
          return;
        }

        const userId = String(ctx.from?.id ?? 'unknown');
        
        if (lastTx[userId] !== id) {
          await ctx.answerCbQuery('❌ Cannot delete this transaction. You can only delete your most recent transaction.');
          return;
        }

        await deleteUseCase.execute(id);
        lastTx[userId] = '';
        
        // Remove inline keyboard after deletion
        await ctx.editMessageReplyMarkup(undefined);
        await ctx.answerCbQuery('✅ Transaction deleted');
      } catch (error) {
        console.error('Error deleting transaction:', {
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined,
          userId: ctx.from?.id,
          transactionId: ctx.match?.[1]
        });

        if (error instanceof AppError) {
          await ctx.answerCbQuery(`❌ ${error.message}`);
        } else {
          await ctx.answerCbQuery('❌ Failed to delete transaction');
        }
      }
    });

    bot.launch();
    console.log('✅ Telegram bot started successfully');
  } catch (error) {
    console.error('Failed to start Telegram bot:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // Don't throw - let the application continue without bot
    console.warn('⚠️ Application will continue without Telegram bot functionality');
  }
}
