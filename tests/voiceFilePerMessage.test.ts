import 'reflect-metadata';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Update } from 'telegraf/types';
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
import { downloadVoiceFile } from '../src/delivery/messaging/telegram/utils';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { ProcessVoiceInputUseCase } from '../src/modules/voiceProcessing/application/processVoiceInput';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { listenOnLoopback, LoopbackServer } from './helpers/testServer';
import { TelegramStand } from './helpers/telegramStand';

/**
 * FT-222: the same voice forwarded to the bot twice comes as two messages with one `file_id`, and the two handlers run
 * side by side. The voice was downloaded to `downloads/<file_id>`: one path for both. The first, done, removed its
 * files (FT-216) — the second's too, and the second failed on the transcription instead of writing its record. Each
 * download has a path of its own now, and each handler removes only its own files.
 *
 * The bot is the one `startTelegramBot` assembles, on the stand (`tests/helpers/telegramStand.ts`, #294). Since #317 it
 * takes the updates of one chat one at a time, so two voices of one chat no longer run side by side; the two handlers
 * still do when two chats send the same voice at once — the person and someone they forwarded it to, say — and that is
 * the race here. Real downloads from a server on 127.0.0.1 — Telegram's file storage — into a temporary `downloads/`,
 * the real voice pipeline and SQLite; ffmpeg is faked (it copies the voice to the `.mp3`), and so is OpenAI: it reads
 * the file it is given, as the real one does.
 */

jest.mock('child_process', () => jest.requireActual('./helpers/fakeFfmpeg').childProcessWithFakeFfmpeg());

const TELEGRAM_ID = 131184740;
/** The other person who sends the same voice. */
const OTHER_ID = 131184741;
const FILE_ID = 'AwACAgIAAxkBAAIBVoice-the-same';

describe('the same voice twice at once: each message has its own file (FT-222)', () => {
  let db: TestDatabase;
  let telegramFiles: LoopbackServer;
  let downloads: string;
  let stand: TelegramStand;
  const parser = {
    transcribe: jest.fn(),
    analyzeInput: jest.fn(),
    analyzeTransactions: jest.fn(),
  };

  beforeEach(async () => {
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

    stand = new TelegramStand({ id: TELEGRAM_ID, first_name: 'Shukur' });
    stand.install({ fileRoot: telegramFiles.baseUrl });
    // After install(), which points the downloads at the system's temp folder
    downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'ft222-downloads-'));
    jest.replaceProperty(AppConfig, 'DOWNLOADS_PATH', downloads);
    stand.start({
      transactionModule,
      accountModule,
      categoryModule,
      userModule,
      botMessageModule: new BotMessageModule(new SqliteBotMessageRepository(ds)),
      voiceModule: { getProcessVoiceInputUseCase: () => voice },
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await telegramFiles.close();
    await db.close();
    fs.rmSync(downloads, { recursive: true, force: true });
  });

  /** The voice sent by the person and by the other person at once: a message in each chat, the same `file_id`. */
  function sameVoiceTwice(): Update.MessageUpdate[] {
    return [stand.voiceUpdate(FILE_ID), stand.voiceUpdate(FILE_ID, { from: OTHER_ID })];
  }

  /** What the bot wrote back, in every chat. */
  const sent = () => stand.sent().map(message => message.text);

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

    // Handled side by side, as polling handles a batch; each delivery settles when its handler is done
    const handlers = sameVoiceTwice().map(update => stand.deliver(update));
    firstDone = Promise.race(handlers);
    await Promise.all(handlers);

    expect(parser.transcribe).toHaveBeenCalledTimes(2);
    // Two confirmations, no «Не удалось обработать»
    expect(sent()).toEqual([expect.stringContaining('Расход'), expect.stringContaining('Расход')]);
    expect(await storedRecords()).toBe(2);
    expect(fs.readdirSync(downloads)).toEqual([]);
  });

  it('the files the two messages were read from are not the same', async () => {
    parser.transcribe.mockImplementation(async (file: string) => {
      await fs.promises.readFile(file);
      return 'кофе двадцать тысяч';
    });

    await stand.deliver(sameVoiceTwice());

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
