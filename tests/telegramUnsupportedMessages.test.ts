import 'reflect-metadata';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AppConfig } from '../src/shared/infrastructure/config/appConfig';
import { telegramAccess } from '../src/shared/domain/access/telegramAccess';
import { winstonLogger } from '../src/shared/infrastructure/logging';
import { startTelegramBot } from '../src/delivery/messaging/telegram/telegramBot';
import { RU } from '../src/delivery/messaging/telegram/i18n/ru';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';

/**
 * #279: the bot handled only a text and a voice; a photo, an audio file, a video note, a document and a sticker got
 * silence, and the person could not tell whether it arrived. Now each gets one line — what the bot understands and how
 * to write a record. Only after the closed access (FT-153): a stranger still gets nothing. The text and the voice go
 * to the capture as before, and nothing of the five reaches it. The bot is the real one `startTelegramBot` assembles,
 * on a real Telegraf: only polling, Telegram's API and the download of a voice are fakes.
 */

interface ApiCall { method: string; payload: any }

// The real Telegraf without the network, as in telegramAllowedUsers.test.ts: launch() does not poll; every Bot API
// call is kept and answered
jest.mock('telegraf', () => {
  const actual = jest.requireActual('telegraf');
  class TestTelegraf extends actual.Telegraf {
    static last: TestTelegraf;
    readonly calls: ApiCall[] = [];

    constructor(token: string, options?: unknown) {
      super(token, options);
      this.botInfo = { id: 1, is_bot: true, first_name: 'Kapelka', username: 'KapelkaBot' };
      TestTelegraf.last = this;
    }

    launch() {
      return new Promise(() => undefined);
    }
  }
  let nextMessageId = 100;
  actual.Telegram.prototype.callApi = async function (method: string, payload: any) {
    TestTelegraf.last.calls.push({ method, payload });
    if (method === 'sendMessage') {
      return { message_id: nextMessageId++, date: 0, chat: { id: payload.chat_id, type: 'private' }, text: payload.text };
    }
    if (method === 'getFile') return { file_id: payload.file_id, file_unique_id: 'u', file_path: 'voice/file.oga' };
    return true;
  };
  return { ...actual, Telegraf: TestTelegraf };
});

// The voice is not downloaded: the voice pipeline is a fake that takes any path
jest.mock('../src/delivery/messaging/telegram/utils/fileDownloader', () => ({
  ...jest.requireActual('../src/delivery/messaging/telegram/utils/fileDownloader'),
  downloadVoiceFile: jest.fn(async () => '/nonexistent/voice.ogg'),
  cleanupFile: jest.fn(async () => undefined),
}));

const ALLOWED = 111;
const STRANGER = 222;
const UNSUPPORTED_ANSWER = 'Пока понимаю текст и голосовые. Напишите: такси 18к.';
// What Telegram draws as an emoji picture
const EMOJI = /\p{Emoji_Presentation}|️/u;

const file = (id: string) => ({ file_id: id, file_unique_id: `u-${id}` });

/** The five a person may send that the bot does not read, as the Bot API sends them. */
const UNSUPPORTED: Array<[string, Record<string, unknown>]> = [
  ['a photo', { photo: [{ ...file('p1'), width: 90, height: 90 }] }],
  ['a photo with a caption — the caption is not read as a text', { photo: [{ ...file('p2'), width: 90, height: 90 }], caption: 'такси 18к' }],
  ['an audio file', { audio: { ...file('a1'), duration: 3 } }],
  ['a video note', { video_note: { ...file('vn1'), length: 240, duration: 3 } }],
  ['a document', { document: { ...file('d1'), file_name: 'чек.pdf' } }],
  ['a GIF — Telegram sends it as a document too', { animation: { ...file('g1'), width: 90, height: 90, duration: 1 }, document: { ...file('g1') } }],
  ['a sticker', { sticker: { ...file('s1'), type: 'regular', width: 512, height: 512, is_animated: false, is_video: false } }],
];

describe('the bot answers what it does not read (#279)', () => {
  let db: TestDatabase;
  let downloads: string;
  let bot: { calls: ApiCall[]; handleUpdate(update: unknown): Promise<void> };
  let updateId = 1;
  const capture = jest.fn();
  const processVoice = jest.fn();

  function message(sender: number, content: Record<string, unknown>) {
    return bot.handleUpdate({
      update_id: updateId++,
      message: {
        message_id: updateId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: sender, type: 'private' },
        from: { id: sender, is_bot: false, first_name: 'Test', username: `user${sender}` },
        ...content,
      },
    });
  }

  /** The texts the bot sent after it started (the command menu goes out at start). */
  const replies = () => bot.calls.filter(call => call.method === 'sendMessage').map(call => ({ chat: call.payload.chat_id, text: call.payload.text }));
  const usersInDb = async () => (await db.dataSource.query('SELECT telegram_id FROM users')).map((row: { telegram_id: string }) => row.telegram_id);

  beforeEach(async () => {
    downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'i279-downloads-'));
    jest.replaceProperty(AppConfig, 'TG_BOT_API_KEY', '123:test');
    jest.replaceProperty(AppConfig, 'ENABLE_TELEGRAM_POLLING', true);
    jest.replaceProperty(AppConfig, 'WEBHOOK_MODE', false);
    jest.replaceProperty(AppConfig, 'DOWNLOADS_PATH', downloads);
    jest.replaceProperty(AppConfig, 'TELEGRAM_ACCESS', telegramAccess([String(ALLOWED)]));
    jest.spyOn(process, 'once').mockImplementation(() => process);
    jest.spyOn(winstonLogger, 'warn').mockImplementation(() => winstonLogger);
    // Nothing to write in what was said or written: the capture answers «Не нашёл, что записать»
    capture.mockReset().mockResolvedValue({ transactions: [], debts: [] });
    processVoice.mockReset().mockResolvedValue({ text: 'привет', transactions: [], debts: [] });

    db = await openMigratedDatabase();
    const userModule = new UserModule(new SqliteUserRepository(db.dataSource), new SqliteUserSettingsRepository(db.dataSource));
    const voiceModule = { getProcessVoiceInputUseCase: () => ({ execute: processVoice }) };
    const quickCaptureModule = { getQuickCaptureService: () => ({ capture }) };
    const transactionModule = { findByClientId: async () => [] };

    startTelegramBot(voiceModule as any, transactionModule as any, userModule, quickCaptureModule as any);
    bot = (jest.requireMock('telegraf') as any).Telegraf.last;
  });

  afterEach(async () => {
    await db.close();
    fs.rmSync(downloads, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it.each(UNSUPPORTED)('%s gets one line: what the bot understands and how to write', async (_name, content) => {
    await message(ALLOWED, content);

    expect(replies()).toEqual([{ chat: ALLOWED, text: UNSUPPORTED_ANSWER }]);
    expect(RU.capture.unsupported).toBe(UNSUPPORTED_ANSWER);
    expect(UNSUPPORTED_ANSWER).not.toMatch(EMOJI);
    expect(capture).not.toHaveBeenCalled();
    expect(processVoice).not.toHaveBeenCalled();
  });

  it('a stranger gets nothing for any of them, and no user is made', async () => {
    for (const [, content] of UNSUPPORTED) await message(STRANGER, content);

    expect(replies()).toEqual([]);
    expect(await usersInDb()).toEqual([]);
  });

  it('a text goes to the capture as before, without the line', async () => {
    await message(ALLOWED, { text: 'кофе 25000' });

    expect(capture).toHaveBeenCalledWith(expect.objectContaining({ text: 'кофе 25000', source: 'telegram' }));
    expect(replies().map(reply => reply.text)).toEqual([RU.capture.notUnderstood]);
  });

  it('a voice goes to the voice pipeline as before, without the line', async () => {
    await message(ALLOWED, { voice: { ...file('v1'), duration: 2 } });

    expect(processVoice).toHaveBeenCalledWith(expect.objectContaining({ filePath: '/nonexistent/voice.ogg', source: 'telegram' }), expect.anything());
    expect(replies().map(reply => reply.text)).toEqual([RU.capture.notUnderstood]);
  });

  it('a service message — writing allowed from the Mini App — gets no answer', async () => {
    await message(ALLOWED, { write_access_allowed: { from_request: true } });

    expect(replies()).toEqual([]);
  });
});
