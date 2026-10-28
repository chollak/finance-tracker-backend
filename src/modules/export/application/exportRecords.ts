import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { BusinessLogicError, ConflictError, ExternalServiceError } from '../../../shared/domain/errors/AppError';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { todayDateOnly } from '../../../shared/domain/dates/dateOnly';
import { ChatClosedError, ChatFileSender, ExportSources, RecordsFile } from '../domain/exportPorts';
import { buildRecordsCsv, exportFileName } from '../domain/recordsCsv';

const logger = getLogger(LogCategory.TRANSACTION);

/** The CSV of all of the user's records and moves that are not deleted (FT-126). */
export class BuildRecordsFileUseCase {
  constructor(private sources: ExportSources) {}

  async execute(input: { userId: string }): Promise<Result<RecordsFile>> {
    try {
      const [records, moves, accounts] = await Promise.all([
        this.sources.records(input.userId),
        this.sources.moves(input.userId),
        this.sources.accounts(input.userId),
      ]);
      const { text, count } = buildRecordsCsv({ records, moves, accounts });
      const date = todayDateOnly();
      return ResultHelper.success({ fileName: exportFileName(date), text, count, date });
    } catch (error) {
      logger.error('Failed to build the export', error as Error, { userId: input.userId });
      return ResultHelper.failure(new BusinessLogicError('Failed to build the export'));
    }
  }
}

/** What the screen says after sending: «kapelka-2026-10-14.csv · 205 записей». */
export interface SentRecordsFile {
  fileName: string;
  count: number;
}

/**
 * «Скачать все записи» in Telegram (FT-126): the file goes to the user's private chat with the bot. One export per
 * user at a time — a second press while the file is on its way sends no second file (409); after it is sent, a press
 * makes a new one. With nothing recorded no empty file is sent.
 */
export class SendRecordsToChatUseCase {
  private sending = new Set<string>();

  constructor(private buildFile: BuildRecordsFileUseCase, private sender?: ChatFileSender) {}

  async execute(input: { userId: string; chatId: string }): Promise<Result<SentRecordsFile>> {
    if (!this.sender) return ResultHelper.failure(new ExternalServiceError('Telegram bot is not configured'));
    if (this.sending.has(input.userId)) {
      return ResultHelper.failure(new ConflictError('The export is already on its way to the chat', { reason: 'EXPORT_IN_PROGRESS' }));
    }
    this.sending.add(input.userId);
    try {
      const built = await this.buildFile.execute({ userId: input.userId });
      if (!built.success) return built;
      const { fileName, count } = built.data;
      if (count > 0) await this.sender.sendFile(input.chatId, built.data);
      logger.info('Export sent to the chat with the bot', { userId: input.userId, count });
      return ResultHelper.success({ fileName, count });
    } catch (error) {
      if (error instanceof ChatClosedError) return ResultHelper.failure(error);
      // Logged here, not answered: Telegram's message names the bot's API address
      logger.error('Failed to send the export to the chat', error as Error, { userId: input.userId });
      return ResultHelper.failure(new ExternalServiceError('Telegram'));
    } finally {
      this.sending.delete(input.userId);
    }
  }
}
