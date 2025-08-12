import { Telegraf, Markup } from 'telegraf';
import fs from 'fs';
import https from 'https';
import http from 'http';
import path from 'path';
import os from 'os';
import { pipeline } from 'stream/promises';
import { AppConfig } from '../../../shared/infrastructure/config/appConfig';
import { ErrorFactory, AppError } from '../../../shared/domain/errors/AppError';
import { ERROR_MESSAGES } from '../../../shared/domain/constants/messages';
import { VoiceProcessingModule } from '../../../modules/voiceProcessing/voiceProcessingModule';
import { TransactionModule } from '../../../modules/transaction/transactionModule';

// Helper function for consistent URL generation
function createWebAppUrl(userId: string, params: { edit?: string } = {}): string {
  if (!AppConfig.WEB_APP_URL) {
    throw new Error('WEB_APP_URL not configured');
  }
  
  const url = new URL(`${AppConfig.WEB_APP_URL}/webapp/transactions`);
  url.searchParams.set('userId', userId);
  
  if (params.edit) {
    url.searchParams.set('edit', params.edit);
  }
  
  return url.toString();
}

async function downloadFile(url: string, dest: string): Promise<string> {
  try {
    const dir = path.dirname(dest);
    await fs.promises.mkdir(dir, { recursive: true });

    const file = fs.createWriteStream(dest);

    return new Promise((resolve, reject) => {
      const handleError = async (err: Error) => {
        console.error('Download error details:', {
          error: err.message,
          stack: err.stack,
          url: url,
          dest: dest,
          errorType: err.constructor.name
        });

        try {
          // Close the file stream first if it's still open
          if (!file.destroyed) {
            file.destroy();
          }
          // Try to cleanup the file, but ignore if it doesn't exist
          await fs.promises.unlink(dest).catch(() => {});
        } catch (cleanupErr) {
          // Silently ignore cleanup errors
        }
        reject(ErrorFactory.externalService('File Download', err));
      };

      file.on('error', handleError);

      // Choose appropriate module based on URL protocol
      const client = url.startsWith('https:') ? https : http;
      
      const request = client
        .get(url, async response => {
          try {
            console.log(`Download attempt: ${url} -> ${dest}, Status: ${response.statusCode}`);
            
            if (response.statusCode !== 200) {
              throw new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`);
            }
            
            await pipeline(response, file);
            console.log(`Download completed: ${dest}`);
            resolve(dest);
          } catch (err) {
            handleError(err as Error);
          }
        })
        .on('error', handleError);

      // Set timeout to prevent hanging downloads
      request.setTimeout(30000, () => {
        request.destroy();
        handleError(new Error('Download timeout after 30 seconds'));
      });
    });
  } catch (error) {
    console.error('Download setup error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      url: url,
      dest: dest
    });
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
        const userId = String(ctx.from?.id ?? 'unknown');
        const url = createWebAppUrl(userId);
        
        await ctx.reply(
          '👋 Welcome to AI Finance Tracker!\n\n' +
          '🎤 Send voice messages to add transactions automatically\n' +
          '💬 Or type your expenses in text\n' +
          '📊 View and manage your transactions below',
          Markup.inlineKeyboard([
            Markup.button.webApp('📊 Open Transactions', url)
          ])
        );
      } catch (error) {
        console.error('❌ /start command error:', error);
        await ctx.reply('Welcome! Sorry, there was an issue setting up the app.');
      }
    });

    bot.command('transactions', async ctx => {
      try {
        const userId = String(ctx.from?.id ?? 'unknown');
        const url = createWebAppUrl(userId);
        
        await ctx.reply(
          '📊 View and manage your transactions',
          Markup.inlineKeyboard([
            Markup.button.webApp('📊 Open Transactions', url)
          ])
        );
      } catch (error) {
        console.error('❌ /transactions command error:', error);
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

        const url = AppConfig.WEB_APP_URL ? createWebAppUrl(userId) : undefined;
        
        for (const tx of result.transactions) {
          lastTx[userId] = tx.id;
          
          // Smart confirmation system - only confirm if confidence is low
          const confidence = tx.confidence || 0.8;
          const needsConfirmation = confidence < 0.6;
          
          if (needsConfirmation) {
            // Ask for confirmation with edit options
            let message = `🤔 Please confirm:\n📝 ${result.text}\n\n`;
            message += `💰 Amount: ${fmt.format(tx.amount)}\n`;
            message += `📂 Category: ${tx.category}\n`;
            message += `📊 Type: ${tx.type}`;
            if (tx.merchant) message += `\n🏪 Merchant: ${tx.merchant}`;
            message += `\n\n⚠️ Confidence: ${Math.round(confidence * 100)}%`;
            
            await ctx.reply(
              message,
              Markup.inlineKeyboard([
                [
                  Markup.button.callback('✅ Confirm', `confirm:${tx.id}`),
                  Markup.button.callback('✏️ Edit', `edit:${tx.id}`)
                ],
                [Markup.button.callback('❌ Delete', `delete:${tx.id}`)],
                ...(url ? [[Markup.button.webApp('📊 View All', url)]] : [])
              ])
            );
          } else {
            // Auto-save with high confidence
            let message = `✅ Auto-saved: ${result.text}\n\n`;
            message += `💰 Amount: ${fmt.format(tx.amount)}\n`;
            message += `📂 Category: ${tx.category}\n`;
            message += `📊 Type: ${tx.type}`;
            if (tx.merchant) message += `\n🏪 ${tx.merchant}`;
            
            await ctx.reply(
              message,
              Markup.inlineKeyboard([
                [Markup.button.callback('✏️ Edit', `edit:${tx.id}`), Markup.button.callback('🗑️ Delete', `delete:${tx.id}`)],
                ...(url ? [[Markup.button.webApp('📊 Open app', url)]] : [])
              ])
            );
          }
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

        // Try to use downloads directory first, fallback to temp directory on any error
        try {
          await fs.promises.mkdir(downloadsDir, { recursive: true });
          filePath = path.join(downloadsDir, ctx.message.voice.file_id);
          // Test if we can actually write to this location
          await downloadFile(fileLink.href, filePath);
        } catch (downloadError) {
          console.warn('Cannot write to downloads directory, retrying with temp directory:', downloadError);
          filePath = path.join(os.tmpdir(), `voice_${ctx.message.voice.file_id}`);
          // Retry download with temp directory
          await downloadFile(fileLink.href, filePath);
        }
        
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

        const url = AppConfig.WEB_APP_URL ? createWebAppUrl(userId) : undefined;
        
        for (const tx of result.transactions) {
          lastTx[userId] = tx.id;
          
          // Smart confirmation system - only confirm if confidence is low
          const confidence = tx.confidence || 0.8;
          const needsConfirmation = confidence < 0.6;
          
          if (needsConfirmation) {
            // Ask for confirmation with edit options
            let message = `🎤🤔 Please confirm:\n📝 ${result.text}\n\n`;
            message += `💰 Amount: ${fmt.format(tx.amount)}\n`;
            message += `📂 Category: ${tx.category}\n`;
            message += `📊 Type: ${tx.type}`;
            if (tx.merchant) message += `\n🏪 Merchant: ${tx.merchant}`;
            message += `\n\n⚠️ Confidence: ${Math.round(confidence * 100)}%`;
            
            await ctx.reply(
              message,
              Markup.inlineKeyboard([
                [
                  Markup.button.callback('✅ Confirm', `confirm:${tx.id}`),
                  Markup.button.callback('✏️ Edit', `edit:${tx.id}`)
                ],
                [Markup.button.callback('❌ Delete', `delete:${tx.id}`)],
                ...(url ? [[Markup.button.webApp('📊 View All', url)]] : [])
              ])
            );
          } else {
            // Auto-save with high confidence
            let message = `🎤✅ Auto-saved: ${result.text}\n\n`;
            message += `💰 Amount: ${fmt.format(tx.amount)}\n`;
            message += `📂 Category: ${tx.category}\n`;
            message += `📊 Type: ${tx.type}`;
            if (tx.merchant) message += `\n🏪 ${tx.merchant}`;
            
            await ctx.reply(
              message,
              Markup.inlineKeyboard([
                [Markup.button.callback('✏️ Edit', `edit:${tx.id}`), Markup.button.callback('🗑️ Delete', `delete:${tx.id}`)],
                ...(url ? [[Markup.button.webApp('📊 Open app', url)]] : [])
              ])
            );
          }
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
        // Clean up downloaded file (if it exists)
        if (filePath) {
          try {
            await fs.promises.unlink(filePath);
          } catch (err) {
            // Silently ignore cleanup errors - file might not exist or already be cleaned up
          }
        }
      }
    });

    // Confirm transaction action
    bot.action(/confirm:(.+)/, async ctx => {
      try {
        const id = ctx.match?.[1];
        if (!id) {
          await ctx.answerCbQuery('❌ Invalid transaction ID');
          return;
        }

        await ctx.answerCbQuery('✅ Transaction confirmed!');
        const originalText = (ctx.callbackQuery?.message as any)?.text;
        await ctx.editMessageText(
          originalText?.replace('🤔 Please confirm:', '✅ Confirmed:') || 'Transaction confirmed!',
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '✏️ Edit', callback_data: `edit:${id}` },
                { text: '🗑️ Delete', callback_data: `delete:${id}` }
              ]]
            }
          }
        );
      } catch (error) {
        console.error('Error confirming transaction:', error);
        await ctx.answerCbQuery('❌ Failed to confirm transaction');
      }
    });

    // Edit transaction action (redirect to web app)
    bot.action(/edit:(.+)/, async ctx => {
      try {
        const id = ctx.match?.[1];
        if (!id) {
          await ctx.answerCbQuery('❌ Invalid transaction ID');
          return;
        }

        const userId = String(ctx.from?.id ?? 'unknown');
        
        try {
          const url = createWebAppUrl(userId, { edit: id });
          
          await ctx.answerCbQuery('✏️ Opening edit form...');
          await ctx.reply(
            '✏️ Edit transaction',
            Markup.inlineKeyboard([
              Markup.button.webApp('✏️ Edit Transaction', url)
            ])
          );
        } catch (urlError) {
          await ctx.answerCbQuery('❌ Web app not configured');
          return;
        }
      } catch (error) {
        console.error('Error handling edit request:', error);
        await ctx.answerCbQuery('❌ Failed to open edit form');
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
