import { Telegram } from 'telegraf';
import { AppConfig } from '../../shared/infrastructure/config/appConfig';
import { ChatFileSender, ExportSources } from './domain/exportPorts';
import { BuildRecordsFileUseCase, SendRecordsToChatUseCase } from './application/exportRecords';
import { TelegramChatFileSender } from './infrastructure/TelegramChatFileSender';

/**
 * «Скачать все записи» (FT-126): a CSV of every record and move that is not deleted, downloaded in a browser or sent
 * to the private chat with the bot in Telegram. Reads the transaction and account modules through `ExportSources`;
 * sends through the Bot API (`sendDocument`) when the bot token is set.
 */
export class ExportModule {
  private buildFile: BuildRecordsFileUseCase;
  private sendToChat: SendRecordsToChatUseCase;

  constructor(sources: ExportSources, sender?: ChatFileSender) {
    this.buildFile = new BuildRecordsFileUseCase(sources);
    // One instance: it knows which users' files are on their way
    this.sendToChat = new SendRecordsToChatUseCase(this.buildFile, sender);
  }

  static create(sources: ExportSources): ExportModule {
    const sender = AppConfig.TG_BOT_API_KEY ? new TelegramChatFileSender(new Telegram(AppConfig.TG_BOT_API_KEY)) : undefined;
    return new ExportModule(sources, sender);
  }

  getBuildRecordsFileUseCase(): BuildRecordsFileUseCase {
    return this.buildFile;
  }

  getSendRecordsToChatUseCase(): SendRecordsToChatUseCase {
    return this.sendToChat;
  }
}
