import 'reflect-metadata';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AppConfig } from '../src/shared/infrastructure/config/appConfig';
import { TransactionModule } from '../src/modules/transaction/transactionModule';
import { SqliteTransactionRepository } from '../src/modules/transaction/infrastructure/persistence/SqliteTransactionRepository';
import { CategoryModule } from '../src/modules/category/categoryModule';
import { SqliteCategoryRepository } from '../src/modules/category/infrastructure/SqliteCategoryRepository';
import { AccountModule } from '../src/modules/account/accountModule';
import { SqliteAccountRepository } from '../src/modules/account/infrastructure/SqliteAccountRepository';
import { SqliteAccountMoveRepository } from '../src/modules/account/infrastructure/SqliteAccountMoveRepository';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { BotMessageModule } from '../src/modules/botMessage/botMessageModule';
import { SqliteBotMessageRepository } from '../src/modules/botMessage/infrastructure/SqliteBotMessageRepository';
import { registerMessageHandlers } from '../src/delivery/messaging/telegram/handlers/messageHandlers';
import { downloadVoiceFile } from '../src/delivery/messaging/telegram/utils';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { ProcessVoiceInputUseCase } from '../src/modules/voiceProcessing/application/processVoiceInput';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { listenOnLoopback, LoopbackServer } from './helpers/testServer';

/**
 * FT-222: the same voice forwarded to the bot twice comes as two messages with one `file_id`, and the two handlers run
 * side by side. The voice was downloaded to `downloads/<file_id>`: one path for both. The first, done, removed its
 * files (FT-216) — the second's too, and the second failed on the transcription instead of writing its record. Each
 * download has a path of its own now, and each handler removes only its own files.
 *
 * Real downloads from a server on 127.0.0.1 into a temporary `downloads/`, the real voice pipeline and SQLite; ffmpeg
 * is faked (it copies the voice to the `.mp3`), and so is OpenAI: it reads the file it is given, as the real one does.
 */

jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process');
  const { EventEmitter } = jest.requireActual('events');
  const files = jest.requireActual('fs');
  return {
    ...actual,
    spawn: jest.fn((_command: string, args: string[]) => {
      const ffmpeg = new EventEmitter();
      setImmediate(() => {
        try {
          files.copyFileSync(args[args.indexOf('-i') + 1], args[args.length - 1]);
          ffmpeg.emit('close', 0, null);
        } catch {
          ffmpeg.emit('close', 1, null);
        }
      });
      return ffmpeg;
    }),
  };
});

const TELEGRAM_ID = 131184740;
const FILE_ID = 'AwACAgIAAxkBAAIBVoice-the-same';

type Middleware = (ctx: any, next: () => Promise<void>) => Promise<void> | void;

/** The handlers registerMessageHandlers puts on a bot; an update runs the first chain that matches it. */
class Bot {
  readonly handlers: Array<{ filter: (update: any) => boolean; chain: Middleware[] }> = [];
  on(filter: (update: any) => boolean, ...chain: Middleware[]) { this.handlers.push({ filter, chain }); }
  async handle(ctx: any): Promise<void> {
    const chain = this.handlers.find(({ filter }) => filter(ctx.update))?.chain ?? [];
    const step = async (index: number): Promise<void> => {
      if (index < chain.length) await chain[index](ctx, () => step(index + 1));
    };
    await step(0);
  }
}

describe('the same voice twice at once: each message has its own file (FT-222)', () => {
  let db: TestDatabase;
  let telegramFiles: LoopbackServer;
  let downloads: string;
  let bot: Bot;
  let modules: Record<string, unknown>;
  let sent: string[];
  let nextMessageId: number;
  const parser = {
    transcribe: jest.fn(),
    analyzeInput: jest.fn(),
    analyzeTransactions: jest.fn(),
  };

  beforeEach(async () => {
    sent = [];
    nextMessageId = 10;
    downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'ft222-downloads-'));
    jest.replaceProperty(AppConfig, 'DOWNLOADS_PATH', downloads);
    jest.spyOn(AppConfig, 'getWebAppUrl').mockReturnValue('https://miniapp.test');
    parser.transcribe.mockReset();
    parser.analyzeInput.mockReset().mockResolvedValue({
      transactions: [{ intent: 'transaction', amount: 20000, category: 'Кафе', type: 'expense', description: 'кофе' }],
      debts: [],
    });

    // Telegram's file storage: the voice by its link
    telegramFiles = await listenOnLoopback((_req, res) => res.end('OggS voice'));

    db = await openMigratedDatabase();
    const ds = db.dataSource;
    const categoryModule = new CategoryModule(new SqliteCategoryRepository(ds));
    const accountModule = new AccountModule(new SqliteAccountRepository(ds), undefined, new SqliteAccountMoveRepository(ds));
    const transactionModule = new TransactionModule(new SqliteTransactionRepository(ds));
    transactionModule.setCategoryResolver(categoryModule.getCatalog());
    transactionModule.setAccountResolver(accountModule.getBook());
    const userModule = new UserModule(new SqliteUserRepository(ds), new SqliteUserSettingsRepository(ds));
    const voice = new ProcessVoiceInputUseCase(parser as unknown as TranscriptionService, transactionModule.getCreateTransactionUseCase());

    bot = new Bot();
    registerMessageHandlers(bot as any, undefined, userModule);
    modules = {
      transactionModule,
      accountModule,
      categoryModule,
      userModule,
      botMessageModule: new BotMessageModule(new SqliteBotMessageRepository(ds)),
      voiceModule: { getProcessVoiceInputUseCase: () => voice },
    };
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await telegramFiles.close();
    await db.close();
    fs.rmSync(downloads, { recursive: true, force: true });
  });

  /** A message with the voice, as Telegram sends a forwarded one: a message of its own, the same `file_id`. */
  function sendVoice(): Promise<void> {
    const chat = { id: TELEGRAM_ID, type: 'private' };
    const from = { id: TELEGRAM_ID, first_name: 'Shukur' };
    const message = { message_id: nextMessageId++, date: Math.floor(Date.now() / 1000), chat, from, voice: { file_id: FILE_ID, duration: 2 } };
    let nextBotMessageId = 1000 + message.message_id * 10;
    return bot.handle({
      from,
      chat,
      message,
      update: { update_id: 500 + message.message_id, message },
      session: {},
      modules,
      sendChatAction: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn(async (text: string) => {
        sent.push(text);
        return { message_id: nextBotMessageId++, chat };
      }),
      telegram: {
        editMessageText: jest.fn().mockResolvedValue(true),
        getFileLink: jest.fn(async () => new URL(`${telegramFiles.baseUrl}/file/voice.oga`)),
      },
    });
  }

  async function storedRecords(): Promise<number> {
    const [{ count }] = await db.dataSource.query('SELECT COUNT(*) AS count FROM transactions WHERE deleted_at IS NULL');
    return Number(count);
  }

  it('both are written, and downloads/ is empty after both', async () => {
    // Both are heard before either is done: the first waits for the second to be heard, the second is read only once
    // the first has finished and removed its files — the order in which the shared file was lost
    let secondHeard!: () => void;
    const bothHeard = new Promise<void>(resolve => { secondHeard = resolve; });
    let firstDone: Promise<unknown> = Promise.resolve();
    parser.transcribe.mockImplementation(async (file: string) => {
      if (parser.transcribe.mock.calls.length === 1) {
        await bothHeard;
      } else {
        secondHeard();
        await firstDone;
      }
      await fs.promises.readFile(file);
      return 'кофе двадцать тысяч';
    });

    const handlers = [sendVoice(), sendVoice()];
    firstDone = Promise.race(handlers);
    await Promise.all(handlers);

    expect(parser.transcribe).toHaveBeenCalledTimes(2);
    // Two confirmations, no «Не удалось обработать»
    expect(sent).toEqual([expect.stringContaining('Расход'), expect.stringContaining('Расход')]);
    expect(await storedRecords()).toBe(2);
    expect(fs.readdirSync(downloads)).toEqual([]);
  });

  it('the files the two messages were read from are not the same', async () => {
    parser.transcribe.mockImplementation(async (file: string) => {
      await fs.promises.readFile(file);
      return 'кофе двадцать тысяч';
    });

    await Promise.all([sendVoice(), sendVoice()]);

    const [first, second] = parser.transcribe.mock.calls.map(([file]) => file as string);
    expect(path.dirname(first)).toBe(downloads);
    expect(first).not.toBe(second);
    expect(fs.readdirSync(downloads)).toEqual([]);
  });

  describe('downloadVoiceFile', () => {
    const link = () => `${telegramFiles.baseUrl}/file/voice.oga`;

    it('gives each download of one file_id a path of its own in downloads/', async () => {
      const [first, second] = await Promise.all([downloadVoiceFile(link(), FILE_ID), downloadVoiceFile(link(), FILE_ID)]);

      expect(first).not.toBe(second);
      expect(fs.readdirSync(downloads).sort()).toEqual([path.basename(first), path.basename(second)].sort());
      expect(fs.readFileSync(first, 'utf8')).toBe('OggS voice');
      expect(fs.readFileSync(second, 'utf8')).toBe('OggS voice');
    });

    it('in the temporary folder too, when downloads/ cannot be written', async () => {
      // A file where the folder should be: the folder cannot be made
      const blocked = path.join(downloads, 'not-a-folder');
      fs.writeFileSync(blocked, '');
      jest.replaceProperty(AppConfig, 'DOWNLOADS_PATH', blocked);

      const files = await Promise.all([downloadVoiceFile(link(), FILE_ID), downloadVoiceFile(link(), FILE_ID)]);
      try {
        expect(files.map(path.dirname)).toEqual([os.tmpdir(), os.tmpdir()]);
        expect(files[0]).not.toBe(files[1]);
      } finally {
        files.forEach(file => fs.rmSync(file, { force: true }));
      }
    });
  });
});
