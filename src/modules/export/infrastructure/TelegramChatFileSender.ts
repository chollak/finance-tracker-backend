import type { Telegram } from 'telegraf';
import { MONTHS_OF, plural } from '../../../shared/domain/text/russianWords';
import { ChatClosedError, ChatFileSender, RecordsFile } from '../domain/exportPorts';

/** The line under the file in the chat: «205 записей на 14 октября — таблица CSV, её откроет Excel или Google Таблицы.» */
export function exportCaption(count: number, date: string): string {
  const [, month, day] = date.split('-').map(Number);
  return `${count} ${plural(count, 'запись', 'записи', 'записей')} на ${day} ${MONTHS_OF[month - 1]} — таблица CSV, её откроет Excel или Google Таблицы.`;
}

/**
 * Telegram's own refusals to deliver to this chat: 403 (the bot was blocked, or may not start a conversation) and
 * «chat not found». Anything else — no network, Telegram down — is a failure to retry.
 */
function chatClosed(error: unknown): boolean {
  const failure = error as { response?: { error_code?: number; description?: string } };
  const code = failure?.response?.error_code;
  return code === 403 || (code === 400 && /chat not found/i.test(failure.response?.description ?? ''));
}

/**
 * Sends the export to the user's private chat with the bot (FT-126) with `sendDocument`. It needs only the Bot API —
 * not the polling bot — so the Mini App's request is answered in the same process whether the bot polls or not.
 */
export class TelegramChatFileSender implements ChatFileSender {
  constructor(private telegram: Pick<Telegram, 'sendDocument'>) {}

  async sendFile(chatId: string, file: RecordsFile): Promise<void> {
    try {
      await this.telegram.sendDocument(
        chatId,
        { source: Buffer.from(file.text, 'utf8'), filename: file.fileName },
        { caption: exportCaption(file.count, file.date) }
      );
    } catch (error) {
      if (chatClosed(error)) throw new ChatClosedError();
      throw error;
    }
  }
}
