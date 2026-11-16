import 'reflect-metadata';
import fsPromises from 'fs/promises';
import type { Update } from 'telegraf/types';
import { DataSource } from 'typeorm';
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
import { resolveUserIdToUUID } from '../src/shared/application/helpers/userIdResolver';
import { todayDateOnly } from '../src/shared/domain/dates/dateOnly';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { ProcessVoiceInputUseCase } from '../src/modules/voiceProcessing/application/processVoiceInput';
import { QuickCaptureService } from '../src/modules/quickCapture/application/quickCaptureService';
import { downloadVoiceFile } from '../src/delivery/messaging/telegram/utils';
import { messageClientId } from '../src/delivery/messaging/telegram/utils/messageClientId';
import { isClientId, isStoredClientId, itemClientId } from '../src/modules/transaction/domain/clientId';
import { DatabaseFile, prepareDatabaseOnce } from './helpers/testDatabase';
import { StandModules, TelegramStand } from './helpers/telegramStand';

// ffmpeg is faked: a real one on fake audio is one more process per voice test (#295)
jest.mock('child_process', () => jest.requireActual('./helpers/fakeFfmpeg').childProcessWithFakeFfmpeg());

// A voice message is not downloaded in tests
jest.mock('../src/delivery/messaging/telegram/utils/fileDownloader', () => ({
  ...jest.requireActual('../src/delivery/messaging/telegram/utils/fileDownloader'),
  downloadVoiceFile: jest.fn(async (_url: string, fileId: string) => `/tmp/voice/${fileId}.ogg`),
  cleanupFile: jest.fn(async () => undefined),
}));

/**
 * FT-167: the process can stop while a message is being handled — the shutdown waits for it only so long — and then
 * Telegram sends the message again after the restart, since its offset was never confirmed. The record it wrote must
 * not be written twice, nor confirmed twice: the person would read two confirmations as two records. Real SQLite file,
 * the real capture pipelines with the parser faked; the bot is the one `startTelegramBot` assembles, on the stand
 * (`tests/helpers/telegramStand.ts`, #294), and a restart is a new bot over the same file and the same chat.
 */

const TELEGRAM_ID = 131184740;
/** The bot the chat writes to, and another one: a private chat has the person's id with every bot. */
const BOT_ID = 7_000_000_001;
const OTHER_BOT_ID = 8_000_000_002;
/**
 * Every message was sent on Thursday at 21:40 in Tashkent, and the bot reads it a minute later; only the clock is fake.
 * Its day dates the records (FT-182), so the repeats below carry a real time of input.
 */
const SENT_AT = new Date('2026-10-29T21:40:00+05:00');
const NOW = new Date(SENT_AT.getTime() + 60_000);
const today = todayDateOnly(SENT_AT);

interface Running {
  ds: DataSource;
  modules: StandModules & { transactionModule: TransactionModule; botMessageModule: BotMessageModule };
  userModule: UserModule;
}

/** A step the process is killed at: it never returns, and the test learns the moment the handler gets there. */
interface StopPoint {
  /** Stands for the step. */
  stop: () => Promise<never>;
  /** Resolves once the handler has called the step. */
  reached: Promise<void>;
}

function stopPoint(): StopPoint {
  let reach: () => void = () => undefined;
  const reached = new Promise<void>(resolve => { reach = resolve; });
  return {
    reached,
    stop: () => {
      reach();
      return new Promise<never>(() => undefined);
    },
  };
}

/** A message of the test by its number: the same number is the same Telegram message. */
interface TestMessage {
  message_id: number;
  text?: string;
  voice?: { file_id: string; duration: number };
}

describe('a message Telegram sends again after a restart (FT-167)', () => {
  /** The bot's database: migrated once for the file, each test on its own copy, opened again on a restart. */
  const migrated = prepareDatabaseOnce();
  let db: DatabaseFile;
  let running: Running;
  /** Telegram: the chat with the person, kept across restarts of the bot. */
  let stand: TelegramStand;
  /** The updates of the test by message number: what Telegram delivers, and delivers again after a restart. */
  const updates = new Map<number, { content: string; update: Update.MessageUpdate }>();
  const parser = {
    transcribe: jest.fn(),
    analyzeInput: jest.fn(),
    analyzeTransactions: jest.fn(),
  };

  /** What the bot sent to the chat, in order, as it sent it; a reply that never came back is not in it. */
  const sent = () => stand.sent().map(message => message.text);

  /** The process is killed while it sends its reply: the reply never comes back, nor reaches the chat. */
  function hangReplies(): { reached: Promise<void> } {
    return { reached: stand.hang('sendMessage') };
  }

  /** The bot's process: the modules over the file, the bot over them — `botId` is the bot Telegram knows it as. */
  async function start(botId = BOT_ID): Promise<Running> {
    const ds = await db.open();

    const categoryModule = new CategoryModule(new SqliteCategoryRepository(ds));
    const accountModule = new AccountModule(new SqliteAccountRepository(ds), undefined, new SqliteAccountMoveRepository(ds));
    const transactionModule = new TransactionModule(new SqliteTransactionRepository(ds));
    transactionModule.setCategoryResolver(categoryModule.getCatalog());
    transactionModule.setAccountResolver(accountModule.getBook());
    const userModule = new UserModule(new SqliteUserRepository(ds), new SqliteUserSettingsRepository(ds));
    const botMessageModule = new BotMessageModule(new SqliteBotMessageRepository(ds));
    const service = parser as unknown as TranscriptionService;
    const create = transactionModule.getCreateTransactionUseCase();
    const quickCapture = new QuickCaptureService(new ProcessTextInputUseCase(service, create), transactionModule);
    const voice = new ProcessVoiceInputUseCase(service, create);
    const subscriptionModule = {
      getCheckLimitUseCase: () => ({ execute: async () => ({ allowed: true, isPremium: false, currentUsage: 0, limit: 50, remaining: 50 }) }),
      getIncrementUsageUseCase: () => ({ execute: async () => undefined }),
    };

    const modules = {
      transactionModule,
      accountModule,
      categoryModule,
      userModule,
      botMessageModule,
      subscriptionModule,
      quickCaptureModule: { getQuickCaptureService: () => quickCapture },
      voiceModule: { getProcessVoiceInputUseCase: () => voice },
    };
    stand.start(modules, { botId });
    return { ds, userModule, modules };
  }

  /**
   * The process stops and starts again — as the bot `botId`: the connection closes; the sessions in memory are gone, and
   * whatever the old process waited for never returns to it.
   */
  async function restart(botId = BOT_ID): Promise<void> {
    await running.ds.destroy();
    running = await start(botId);
  }

  /**
   * Message `message_id` of the test as Telegram delivers it, sent at SENT_AT. The same number with the same content is
   * the very update again, as Telegram sends it after a restart; with other content, another bot's message of that
   * number in the same chat.
   */
  function updateOf({ message_id: number, ...content }: TestMessage): Update.MessageUpdate {
    const known = updates.get(number);
    if (known && known.content === JSON.stringify(content)) return known.update;
    const update = content.text !== undefined
      ? stand.textUpdate(content.text, { sentAt: SENT_AT })
      : stand.voiceUpdate(content.voice!.file_id, { sentAt: SENT_AT });
    // Another bot's message of the same number: Telegram numbers a chat's messages with each bot on their own
    if (known) Object.assign(update.message, { message_id: known.update.message.message_id });
    updates.set(number, { content: JSON.stringify(content), update });
    return update;
  }

  /** One update from Telegram, handled to the end — unless a reply hangs, as when the process is stopped. */
  async function deliver(message: TestMessage): Promise<void> {
    await stand.deliver(updateOf(message));
  }

  /**
   * One update whose handling the process is killed at `point`: resolves as soon as the handler is stopped there, not
   * after a guessed delay a slow CI runner may not keep (#261). A handler that ends, or fails, before it fails the test.
   */
  async function deliverUntilKilled(point: { reached: Promise<void> }, message: TestMessage): Promise<void> {
    const outcome = await Promise.race([
      point.reached.then(() => 'killed' as const),
      deliver(message).then(() => 'ended' as const),
    ]);
    if (outcome === 'ended') throw new Error(`Message ${message.message_id} was handled to the end: the step it is killed at was never reached`);
  }

  /** The person presses a button under a bot message. */
  async function press(messageId: number, label: string): Promise<void> {
    await stand.press(messageId, label);
  }

  /**
   * «Кафе» pressed under a quick-add message sent before FT-124: the bot asks for the amount and waits for it
   * (`awaiting_amount`, kept in the session) — the next number is that record's amount.
   */
  async function quickAddCafe(): Promise<void> {
    const owner = await resolveUserIdToUUID(String(TELEGRAM_ID), running.userModule);
    const cafe = (await (running.modules.categoryModule as CategoryModule).getCatalog().listForUser(owner)).find(category => category.name === 'Кафе')!;
    const message = stand.sentBefore('Выберите категорию', [[{ text: 'Кафе', callback_data: `quickadd:${cafe.id}` }]]);
    await stand.press(message, 'Кафе');
    // The bot waits for the amount now, not for a phrase
    expect(sent().slice(-1)[0]).toContain('Введите сумму');
  }

  /** The id of the bot message sent last. */
  const lastBotMessage = () => stand.sent().slice(-1)[0].messageId;

  async function records(): Promise<Array<{ amountMinor: number; description: string; date: string; deletedAt: string | null }>> {
    const rows = await running.ds.query('SELECT amount_minor AS amountMinor, description, date, deleted_at AS deletedAt FROM transactions ORDER BY createdAt, rowid');
    return rows.map((row: any) => ({ ...row, amountMinor: Number(row.amountMinor) }));
  }

  const confirmations = () => sent().filter(text => /Расход/.test(text));
  const coffee = { intent: 'transaction', amount: 25000, category: 'Кафе', type: 'expense', date: today, description: 'кофе' };

  beforeEach(async () => {
    // Every timer is fake as well: a killed update never settles, and Telegraf's 10-minute limit on it, a real timer,
    // would hold Jest open. useRealTimers() drops them
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'queueMicrotask', 'hrtime', 'performance'] });
    updates.clear();
    parser.transcribe.mockReset();
    parser.analyzeInput.mockReset().mockResolvedValue({ transactions: [coffee], debts: [] });
    parser.analyzeTransactions.mockReset();
    db = migrated.newFile();
    jest.spyOn(AppConfig, 'getWebAppUrl').mockReturnValue('https://miniapp.test');
    stand = new TelegramStand({ id: TELEGRAM_ID, first_name: 'Shukur' });
    stand.install();
    running = await start();
    await resolveUserIdToUUID(String(TELEGRAM_ID), running.userModule);
  });

  afterEach(async () => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    (downloadVoiceFile as jest.Mock).mockClear();
    await db.remove();
  });

  it('a text phrase is written and confirmed once', async () => {
    await deliver({ message_id: 10, text: 'кофе 25 тысяч' });
    expect(await records()).toHaveLength(1);
    expect(confirmations()).toHaveLength(1);
    const before = sent().length;

    await restart();
    await deliver({ message_id: 10, text: 'кофе 25 тысяч' });

    expect(await records()).toEqual([expect.objectContaining({ amountMinor: 2_500_000, date: '2026-10-29' })]);
    expect(sent()).toHaveLength(before);
    expect(parser.analyzeInput.mock.calls.length).toBeLessThanOrEqual(1);
    // The same words in a new message are a new record
    await deliver({ message_id: 11, text: 'кофе 25 тысяч' });
    expect(await records()).toHaveLength(2);
  });

  it('stopped before the confirmation went out: the repeat confirms the record it wrote, and writes nothing', async () => {
    await deliverUntilKilled(hangReplies(), { message_id: 10, text: 'кофе 25 тысяч' });
    expect(await records()).toHaveLength(1);
    expect(confirmations()).toHaveLength(0);
    const parsed = parser.analyzeInput.mock.calls.length;
    await restart();
    await deliver({ message_id: 10, text: 'кофе 25 тысяч' });

    expect(await records()).toHaveLength(1);
    expect(confirmations()).toEqual([expect.stringContaining('Кофе')]);
    expect(parser.analyzeInput).toHaveBeenCalledTimes(parsed);
  });

  it('a voice message is neither downloaded nor transcribed again, and written once', async () => {
    jest.spyOn(fsPromises, 'access').mockResolvedValue(undefined);
    jest.spyOn(fsPromises, 'rename').mockResolvedValue(undefined);
    jest.spyOn(fsPromises, 'unlink').mockResolvedValue(undefined);
    parser.transcribe.mockResolvedValue('кофе 25 тысяч');
    const voice = { message_id: 12, voice: { file_id: 'voice-12', duration: 2 } };

    await deliver(voice);
    expect(await records()).toHaveLength(1);
    expect(confirmations()).toHaveLength(1);
    const before = sent().length;

    await restart();
    await deliver(voice);

    expect(await records()).toHaveLength(1);
    expect(sent()).toHaveLength(before);
    expect(parser.transcribe).toHaveBeenCalledTimes(1);
    expect(downloadVoiceFile).toHaveBeenCalledTimes(1);
  });

  it('the amount after a quick-add category is written once, though the session that asked for it is gone', async () => {
    await quickAddCafe();
    await deliver({ message_id: 14, text: '500' });
    expect(await records()).toEqual([expect.objectContaining({ amountMinor: 50_000_000 })]);
    const before = sent().length;

    await restart();
    await deliver({ message_id: 14, text: '500' });

    expect(await records()).toHaveLength(1);
    expect(sent()).toHaveLength(before);
  });

  it('the answer to «Сколько?» is written once', async () => {
    const taxi = { description: 'такси', category: 'Транспорт', type: 'expense', date: today };
    // Read on its own, «18 тысяч» is a record of 18 000 — what the repeat would write once the question is closed
    parser.analyzeInput.mockImplementation(async (text: string) => (text === 'такси'
      ? { transactions: [], debts: [], withoutAmount: [taxi] }
      : { transactions: [{ intent: 'transaction', amount: 18000, category: 'Другое', type: 'expense', date: today, description: text }], debts: [] }));
    await deliver({ message_id: 16, text: 'такси' });
    await deliver({ message_id: 17, text: '18 тысяч' });
    expect(await records()).toEqual([expect.objectContaining({ amountMinor: 1_800_000, description: 'такси' })]);
    const before = sent().length;

    await restart();
    await deliver({ message_id: 17, text: '18 тысяч' });

    expect(await records()).toHaveLength(1);
    expect(sent()).toHaveLength(before);
  });

  it('a record the person cancelled stays cancelled', async () => {
    await deliver({ message_id: 10, text: 'кофе 25 тысяч' });
    await running.ds.query('UPDATE transactions SET deleted_at = ?', [new Date().toISOString()]);

    await restart();
    await deliver({ message_id: 10, text: 'кофе 25 тысяч' });

    expect(await records()).toEqual([expect.objectContaining({ deletedAt: expect.any(String) })]);
  });

  it('the same message number from another bot is a new message, though the chat and bot_messages are the same', async () => {
    const taxi = { intent: 'transaction', amount: 30000, category: 'Транспорт', type: 'expense', date: today, description: 'такси' };
    parser.analyzeInput.mockImplementation(async (text: string) => ({ transactions: [text.startsWith('такси') ? taxi : coffee], debts: [] }));
    await deliver({ message_id: 10, text: 'кофе 25 тысяч' });
    // The move to another bot (live-instance.md, «Переезд»): bot_messages is cleared, the records stay
    await running.ds.query('DELETE FROM bot_messages');

    await restart(OTHER_BOT_ID);
    await deliver({ message_id: 10, text: 'такси 30 тысяч' });

    expect(await records()).toEqual([
      expect.objectContaining({ amountMinor: 2_500_000, description: 'кофе' }),
      expect.objectContaining({ amountMinor: 3_000_000, description: 'такси' }),
    ]);
    expect(confirmations()[confirmations().length - 1]).toContain('Такси');
  });

  it('the answer to «Сумму» changes the amount once and writes nothing', async () => {
    // Read on its own, «30000» is a record of 30 000 — what the repeat would write once the question is closed
    parser.analyzeInput.mockImplementation(async (text: string) => ({
      transactions: [text.startsWith('кофе') ? coffee : { intent: 'transaction', amount: 30000, category: 'Другое', type: 'expense', date: today, description: text }],
      debts: [],
    }));
    await deliver({ message_id: 10, text: 'кофе 25 тысяч' });
    const confirmation = lastBotMessage();
    await press(confirmation, 'Изменить');
    await press(confirmation, 'Сумму');
    await deliver({ message_id: 11, text: '30000' });
    expect(await records()).toEqual([expect.objectContaining({ amountMinor: 3_000_000, description: 'кофе' })]);
    const before = sent().length;

    await restart();
    await deliver({ message_id: 11, text: '30000' });

    expect(await records()).toEqual([expect.objectContaining({ amountMinor: 3_000_000, description: 'кофе' })]);
    expect(sent()).toHaveLength(before);
  });

  describe('the edges left after FT-167 (FT-172)', () => {
    const taxi = { intent: 'transaction', amount: 30000, category: 'Транспорт', type: 'expense', date: today, description: 'такси' };
    const live = async () => (await records()).filter(record => record.deletedAt === null).map(record => record.description);
    const undoReplies = () => sent().filter(text => text.startsWith('Отменил последнюю запись'));

    beforeEach(() => {
      parser.analyzeInput.mockImplementation(async (text: string) => ({ transactions: [text.startsWith('такси') ? taxi : coffee], debts: [] }));
    });

    it('/undo sent again cancels nothing more', async () => {
      await deliver({ message_id: 10, text: 'кофе 25 тысяч' });
      await deliver({ message_id: 11, text: 'такси 30 тысяч' });
      await deliver({ message_id: 12, text: '/undo' });
      expect(await live()).toEqual(['кофе']);
      expect(undoReplies()).toHaveLength(1);
      const before = sent().length;

      await restart();
      await deliver({ message_id: 12, text: '/undo' });

      expect(await live()).toEqual(['кофе']);
      expect(sent()).toHaveLength(before);
      // A new /undo is a new one
      await deliver({ message_id: 13, text: '/undo' });
      expect(await live()).toEqual([]);
    });

    it('/undo stopped before its reply went out: the repeat says what was cancelled, and cancels nothing more', async () => {
      await deliver({ message_id: 10, text: 'кофе 25 тысяч' });
      await deliver({ message_id: 11, text: 'такси 30 тысяч' });
      const taxiConfirmation = lastBotMessage();
      await deliverUntilKilled(hangReplies(), { message_id: 12, text: '/undo' });
      expect(await live()).toEqual(['кофе']);
      expect(undoReplies()).toHaveLength(0);
      await restart();
      await deliver({ message_id: 12, text: '/undo' });

      expect(await live()).toEqual(['кофе']);
      expect(undoReplies()).toEqual([expect.stringContaining('Такси')]);
      // The confirmation is struck through with «Вернуть», and «Вернуть» under the reply brings the record back
      expect(stand.labelsOf(taxiConfirmation).flat()).toContain('Вернуть');
      await press(lastBotMessage(), 'Вернуть');
      expect(await live()).toEqual(['кофе', 'такси']);
    });

    /** The bot message log of the running process; a step that never returns stands for the process being killed there. */
    const runningLog = () => (running.modules.botMessageModule as BotMessageModule).getLog();

    it('/undo killed right after it was marked: the repeat does it on that message, and takes no other', async () => {
      await deliver({ message_id: 10, text: 'кофе 25 тысяч' });
      await deliver({ message_id: 11, text: 'такси 30 тысяч' });
      const killed = stopPoint();
      jest.spyOn(runningLog(), 'save').mockImplementation(killed.stop);
      await deliverUntilKilled(killed, { message_id: 12, text: '/undo' });
      expect(await live()).toEqual(['кофе', 'такси']);

      await restart();
      await deliver({ message_id: 12, text: '/undo' });

      expect(await live()).toEqual(['кофе']);
      expect(undoReplies()).toEqual([expect.stringContaining('Такси')]);
    });

    it('/undo killed while cancelling: the repeat cancels what it kept, and takes no other', async () => {
      await deliver({ message_id: 10, text: 'кофе 25 тысяч' });
      await deliver({ message_id: 11, text: 'такси 30 тысяч' });
      const killed = stopPoint();
      jest.spyOn(running.modules.transactionModule as TransactionModule, 'getDeleteTransactionUseCase')
        .mockReturnValue({ execute: killed.stop } as never);
      await deliverUntilKilled(killed, { message_id: 12, text: '/undo' });

      await restart();
      await deliver({ message_id: 12, text: '/undo' });

      expect(await live()).toEqual(['кофе']);
      expect(undoReplies()).toEqual([expect.stringContaining('Такси')]);
    });

    it('an answer to «Сумму» killed before it was marked: the repeat answers the still open question, no record written', async () => {
      parser.analyzeInput.mockImplementation(async (text: string) => ({
        transactions: [text.startsWith('кофе') ? coffee : { intent: 'transaction', amount: Number(text), category: 'Другое', type: 'expense', date: today, description: text }],
        debts: [],
      }));
      await deliver({ message_id: 10, text: 'кофе 25 тысяч' });
      const confirmation = lastBotMessage();
      await press(confirmation, 'Изменить');
      await press(confirmation, 'Сумму');
      const killed = stopPoint();
      jest.spyOn(runningLog(), 'markHandled').mockImplementation(killed.stop);
      await deliverUntilKilled(killed, { message_id: 11, text: '30000' });

      await restart();
      await deliver({ message_id: 11, text: '30000' });

      expect(await records()).toEqual([expect.objectContaining({ amountMinor: 3_000_000, description: 'кофе' })]);
    });

    it('«Сколько?» of a phrase with no amount, killed while closing the other questions: not asked twice', async () => {
      const noAmount = { description: 'такси', category: 'Транспорт', type: 'expense', date: today };
      parser.analyzeInput.mockResolvedValue({ transactions: [], debts: [], withoutAmount: [noAmount] });
      const asked = () => sent().filter(text => text.includes('Сколько?'));
      const killed = stopPoint();
      jest.spyOn(runningLog(), 'otherQuestions').mockImplementation(killed.stop);
      await deliverUntilKilled(killed, { message_id: 30, text: 'такси' });
      expect(asked()).toHaveLength(1);

      await restart();
      await deliver({ message_id: 30, text: 'такси' });

      expect(asked()).toHaveLength(1);
      expect(parser.analyzeInput).toHaveBeenCalledTimes(1);
    });

    it('a phrase whose confirmation did not go out: the repeat asks «Сколько?» and shows «?» and «понял как» as the first would', async () => {
      const unnamed = { intent: 'transaction', amount: 25000, category: 'Кафе', type: 'expense', date: today, description: 'zzqx' };
      const noAmount = { description: 'такси', category: 'Транспорт', type: 'expense', date: today };
      parser.analyzeInput.mockResolvedValue({ transactions: [unnamed], debts: [], withoutAmount: [noAmount] });
      // The confirmation as it goes out when nothing stops the bot
      await deliver({ message_id: 20, text: 'zzqx 25 и такси' });
      const firstTime = sent()[sent().length - 1];
      expect(firstTime).toContain('Кафе?');
      expect(firstTime).toContain('«25» понял как 25');
      expect(firstTime).toContain('Сколько?');

      await deliverUntilKilled(hangReplies(), { message_id: 21, text: 'zzqx 25 и такси' });
      const parsed = parser.analyzeInput.mock.calls.length;
      await restart();
      await deliver({ message_id: 21, text: 'zzqx 25 и такси' });

      expect(sent()[sent().length - 1]).toBe(firstTime);
      expect(parser.analyzeInput).toHaveBeenCalledTimes(parsed);
      expect((await records()).filter(record => record.description === 'zzqx')).toHaveLength(2);
      // The question is open: the next amount is the taxi's
      await deliver({ message_id: 22, text: '18000' });
      expect(await records()).toContainEqual(expect.objectContaining({ description: 'такси', amountMinor: 1_800_000 }));
    });

    it('a voice whose confirmation did not go out: the repeat shows «Расслышал», without downloading it again', async () => {
      jest.spyOn(fsPromises, 'access').mockResolvedValue(undefined);
      jest.spyOn(fsPromises, 'rename').mockResolvedValue(undefined);
      jest.spyOn(fsPromises, 'unlink').mockResolvedValue(undefined);
      parser.transcribe.mockResolvedValue('кофе 25 тысяч');
      const voice = { message_id: 12, voice: { file_id: 'voice-12', duration: 2 } };

      await deliverUntilKilled(hangReplies(), voice);
      expect(await records()).toHaveLength(1);
      await restart();
      await deliver(voice);

      expect(confirmations()).toEqual([expect.stringContaining('Расслышал: «кофе 25 тысяч»')]);
      expect(await records()).toHaveLength(1);
      expect(downloadVoiceFile).toHaveBeenCalledTimes(1);
    });

    it('a large amount whose question did not go out: the repeat asks it, the records still held', async () => {
      parser.analyzeInput.mockImplementation(async (text: string) => ({
        transactions: [text.startsWith('кофе')
          ? { ...coffee, amount: 25_000_000 }
          : { intent: 'transaction', amount: 25000, category: 'Другое', type: 'expense', date: today, description: text }],
        debts: [],
      }));
      await deliverUntilKilled(hangReplies(), { message_id: 10, text: 'кофе 25000000' });
      expect(await records()).toEqual([expect.objectContaining({ deletedAt: expect.any(String) })]);
      await restart();
      await deliver({ message_id: 10, text: 'кофе 25000000' });

      expect(stand.textOf(lastBotMessage())).toContain('Сумма большая');
      expect(await records()).toEqual([expect.objectContaining({ deletedAt: expect.any(String) })]);
      await deliver({ message_id: 11, text: '25000' });
      expect(await records()).toEqual([expect.objectContaining({ amountMinor: 2_500_000, description: 'кофе', deletedAt: null })]);
    });

    it('two answers to «Сумму» of one message, both sent again: neither writes a record', async () => {
      parser.analyzeInput.mockImplementation(async (text: string) => ({
        transactions: [text.startsWith('кофе') ? coffee : { intent: 'transaction', amount: Number(text), category: 'Другое', type: 'expense', date: today, description: text }],
        debts: [],
      }));
      await deliver({ message_id: 10, text: 'кофе 25 тысяч' });
      const confirmation = lastBotMessage();
      await press(confirmation, 'Изменить');
      await press(confirmation, 'Сумму');
      await deliver({ message_id: 11, text: '30000' });
      await press(confirmation, 'Изменить');
      await press(confirmation, 'Сумму');
      await deliver({ message_id: 12, text: '35000' });
      expect(await records()).toEqual([expect.objectContaining({ amountMinor: 3_500_000, description: 'кофе' })]);
      const before = sent().length;

      await restart();
      await deliver({ message_id: 11, text: '30000' });
      await deliver({ message_id: 12, text: '35000' });

      expect(await records()).toEqual([expect.objectContaining({ amountMinor: 3_500_000, description: 'кофе' })]);
      expect(sent()).toHaveLength(before);
    });

    it('an answer to «Сумму» of a message more than 20 bot messages back writes no record when sent again', async () => {
      parser.analyzeInput.mockImplementation(async (text: string) => ({
        transactions: [text.startsWith('кофе') ? coffee : { intent: 'transaction', amount: Number(text.replace(/\D/g, '')), category: 'Другое', type: 'expense', date: today, description: text }],
        debts: [],
      }));
      await deliver({ message_id: 10, text: 'кофе 25 тысяч' });
      const confirmation = lastBotMessage();
      for (let n = 0; n < 21; n++) await deliver({ message_id: 100 + n, text: `обед ${1000 + n}` });
      await press(confirmation, 'Изменить');
      await press(confirmation, 'Сумму');
      await deliver({ message_id: 200, text: '30000' });
      expect(await records()).toHaveLength(22);
      expect(await records()).toContainEqual(expect.objectContaining({ amountMinor: 3_000_000, description: 'кофе' }));

      await restart();
      await deliver({ message_id: 200, text: '30000' });

      expect(await records()).toHaveLength(22);
    });
  });

  it('the typed answer to a large amount writes the record once', async () => {
    parser.analyzeInput.mockImplementation(async (text: string) => ({
      transactions: [text.startsWith('кофе')
        ? { ...coffee, amount: 25_000_000 }
        : { intent: 'transaction', amount: 25000, category: 'Другое', type: 'expense', date: today, description: text }],
      debts: [],
    }));
    await deliver({ message_id: 10, text: 'кофе 25000000' });
    expect(stand.textOf(lastBotMessage())).toContain('Сумма большая');
    await deliver({ message_id: 11, text: '25000' });
    expect(await records()).toEqual([expect.objectContaining({ amountMinor: 2_500_000, description: 'кофе', deletedAt: null })]);
    const before = sent().length;

    await restart();
    await deliver({ message_id: 11, text: '25000' });

    expect(await records()).toEqual([expect.objectContaining({ amountMinor: 2_500_000, description: 'кофе', deletedAt: null })]);
    expect(sent()).toHaveLength(before);
  });
});

describe('the client id of a Telegram message (FT-167)', () => {
  const ctxOf = (botId: number | undefined, chatId: number, messageId: number) =>
    ({ botInfo: botId === undefined ? undefined : { id: botId }, chat: { id: chatId }, message: { message_id: messageId } }) as any;

  it('names the bot, the chat and the message', () => {
    expect(messageClientId(ctxOf(BOT_ID, TELEGRAM_ID, 10))).toBe(`tg-${BOT_ID}-${TELEGRAM_ID}-10`);
    expect(messageClientId(ctxOf(OTHER_BOT_ID, TELEGRAM_ID, 10))).not.toBe(messageClientId(ctxOf(BOT_ID, TELEGRAM_ID, 10)));
  });

  it('fits the client id rules at the largest Telegram ids, with the «:n» of a phrase’s further records', () => {
    // Bot and chat ids up to 52 bits, a group's chat id negative, message ids up to 2^31
    const id = messageClientId(ctxOf(Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 2_147_483_647))!;
    expect(isClientId(id)).toBe(true);
    expect(isStoredClientId(itemClientId(id, 999))).toBe(true);
  });

  it('is none without the bot, the chat or the message: nothing is guarded then', () => {
    expect(messageClientId(ctxOf(undefined, TELEGRAM_ID, 10))).toBeUndefined();
    expect(messageClientId({ botInfo: { id: BOT_ID }, chat: { id: TELEGRAM_ID } } as any)).toBeUndefined();
  });
});
