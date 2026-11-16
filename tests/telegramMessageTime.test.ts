import 'reflect-metadata';
import fsPromises from 'fs/promises';
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
import { addDaysToDateOnly } from '../src/shared/domain/dates/dateOnly';
import { resolveUserIdToUUID } from '../src/shared/application/helpers/userIdResolver';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { AnalysisContext } from '../src/modules/voiceProcessing/domain/categoryPrompt';
import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { ProcessVoiceInputUseCase } from '../src/modules/voiceProcessing/application/processVoiceInput';
import { QuickCaptureService } from '../src/modules/quickCapture/application/quickCaptureService';
import { winstonLogger } from '../src/shared/infrastructure/logging';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { TelegramStand } from './helpers/telegramStand';

// ffmpeg is faked: a real one on fake audio is one more process per voice test (#295)
jest.mock('child_process', () => jest.requireActual('./helpers/fakeFfmpeg').childProcessWithFakeFfmpeg());

// A voice message is not downloaded in tests
jest.mock('../src/delivery/messaging/telegram/utils/fileDownloader', () => ({
  ...jest.requireActual('../src/delivery/messaging/telegram/utils/fileDownloader'),
  downloadVoiceFile: jest.fn(async (_url: string, fileId: string) => `/tmp/voice/${fileId}.ogg`),
  cleanupFile: jest.fn(async () => undefined),
}));

/**
 * FT-182: while the PC is off Telegram keeps a message up to 24 hours, and the bot reads it once the PC is on. The
 * message is dated by the time it was sent (`message.date`), not by the time it was handled: a phrase sent on Thursday
 * evening and read on Friday morning is Thursday's, its «вчера» is Wednesday — whatever the server's clock says, for
 * Telegram's is the right one (decision 2026-10-30). Real SQLite file, the real capture pipelines with the parser
 * faked; the bot is the one `startTelegramBot` assembles, on the stand (`tests/helpers/telegramStand.ts`, #294). Only
 * the clock is fake.
 */

const NB = ' ';
const TELEGRAM_ID = 131184740;
/** Sent on Thursday at 22:00 in Tashkent. */
const THURSDAY_EVENING = new Date('2026-10-29T22:00:00+05:00');
/** The PC is on and the bot reads it on Friday at 08:10. */
const FRIDAY_MORNING = new Date('2026-10-30T08:10:00+05:00');

/** Unix seconds, as Telegram sends `message.date`. */
const unixSeconds = (moment: Date) => Math.floor(moment.getTime() / 1000);

describe('the bot dates a message by the time it was sent (FT-182)', () => {
  let db: TestDatabase;
  let categoryModule: CategoryModule;
  let userModule: UserModule;
  /** Telegram: the chat with the person. */
  let stand: TelegramStand;
  let warn: jest.SpyInstance;
  const parser = {
    transcribe: jest.fn(),
    analyzeInput: jest.fn(),
    analyzeTransactions: jest.fn(),
  };

  /** What the bot sent to the chat, in order, as it sent it. */
  const sent = () => stand.sent().map(message => message.text);

  beforeEach(async () => {
    jest.useFakeTimers({
      now: FRIDAY_MORNING,
      doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'hrtime', 'performance'],
    });
    jest.spyOn(AppConfig, 'getWebAppUrl').mockReturnValue('https://miniapp.test');
    warn = jest.spyOn(winstonLogger, 'warn');
    parser.transcribe.mockReset();
    parser.analyzeInput.mockReset();
    parser.analyzeTransactions.mockReset();

    db = await openMigratedDatabase();
    const ds = db.dataSource;
    categoryModule = new CategoryModule(new SqliteCategoryRepository(ds));
    const accountModule = new AccountModule(new SqliteAccountRepository(ds), undefined, new SqliteAccountMoveRepository(ds));
    const transactionModule = new TransactionModule(new SqliteTransactionRepository(ds));
    transactionModule.setCategoryResolver(categoryModule.getCatalog());
    transactionModule.setAccountResolver(accountModule.getBook());
    userModule = new UserModule(new SqliteUserRepository(ds), new SqliteUserSettingsRepository(ds));
    const botMessageModule = new BotMessageModule(new SqliteBotMessageRepository(ds));
    const service = parser as unknown as TranscriptionService;
    const create = transactionModule.getCreateTransactionUseCase();
    const quickCapture = new QuickCaptureService(new ProcessTextInputUseCase(service, create), transactionModule);
    const voice = new ProcessVoiceInputUseCase(service, create);

    stand = new TelegramStand({ id: TELEGRAM_ID, first_name: 'Shukur' });
    stand.install();
    stand.start({
      transactionModule,
      accountModule,
      categoryModule,
      userModule,
      botMessageModule,
      quickCaptureModule: { getQuickCaptureService: () => quickCapture },
      voiceModule: { getProcessVoiceInputUseCase: () => voice },
    });
  });

  afterEach(async () => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    await db.close();
  });

  /** A message the person sent at `sentAt`, handled now; `null` — a message without a date. */
  async function deliver(content: Record<string, unknown>, sentAt: Date | null): Promise<void> {
    await stand.deliver(stand.messageUpdate(content, { sentAt }));
  }

  const sendText = (text: string, sentAt: Date | null = THURSDAY_EVENING) => deliver({ text }, sentAt);

  function sendVoice(heard: string, sentAt: Date | null = THURSDAY_EVENING): Promise<void> {
    jest.spyOn(fsPromises, 'access').mockResolvedValue(undefined);
    jest.spyOn(fsPromises, 'rename').mockResolvedValue(undefined);
    jest.spyOn(fsPromises, 'unlink').mockResolvedValue(undefined);
    parser.transcribe.mockResolvedValue(heard);
    return stand.deliver(stand.voiceUpdate(undefined, { sentAt })).then(() => undefined);
  }

  /**
   * «Кафе» pressed under a quick-add message sent before FT-124: the bot asks for the amount and waits for it
   * (`awaiting_amount`) — the next number is that record's amount.
   */
  async function quickAddCafe(): Promise<void> {
    const owner = await resolveUserIdToUUID(String(TELEGRAM_ID), userModule);
    const cafe = (await categoryModule.getCatalog().listForUser(owner)).find(category => category.name === 'Кафе')!;
    const message = stand.sentBefore('Выберите категорию', [[{ text: 'Кафе', callback_data: `quickadd:${cafe.id}` }]]);
    await stand.press(message, 'Кафе');
    // The bot waits for the amount now, not for a phrase
    expect(sent().slice(-1)[0]).toContain('Введите сумму');
  }

  /** The person presses a button under a bot message. */
  async function press(messageId: number, label: string): Promise<void> {
    await stand.press(messageId, label);
  }

  /** The id of the bot message sent last. */
  const lastBotMessage = () => stand.sent().slice(-1)[0].messageId;

  async function storedDates(): Promise<string[]> {
    const rows = await db.dataSource.query('SELECT date FROM transactions WHERE deleted_at IS NULL ORDER BY createdAt, rowid');
    return rows.map((row: { date: string }) => row.date);
  }

  /** The AI as it answers: a record without a date of its own gets the day it is told, «вчера» the day before. */
  function aiAnswers(record: { amount: number; category: string; description: string; daysBack?: number }) {
    parser.analyzeInput.mockImplementation(async (_text: string, context: AnalysisContext = {}) => ({
      transactions: [{
        intent: 'transaction',
        amount: record.amount,
        category: record.category,
        type: 'expense',
        description: record.description,
        ...(record.daysBack && context.today ? { date: addDaysToDateOnly(context.today, -record.daysBack) } : {}),
      }],
      debts: [],
    }));
  }

  const toldDay = (call = parser.analyzeInput.mock.calls.length - 1) => (parser.analyzeInput.mock.calls[call][1] as AnalysisContext).today;

  describe('text', () => {
    it('writes a phrase without a day on the day it was sent, not the day it was read', async () => {
      await sendText('такси 18000');

      expect(await storedDates()).toEqual(['2026-10-29']);
      expect(sent()[sent().length - 1]).toContain(`29${NB}октября`);
      expect(parser.analyzeInput).not.toHaveBeenCalled();
    });

    it('writes «вчера» on the day before it was sent', async () => {
      await sendText('вчера такси 18000');

      expect(await storedDates()).toEqual(['2026-10-28']);
    });

    it('tells the AI the day it was sent, and dates its record by it', async () => {
      aiAnswers({ amount: 25000, category: 'Кафе', description: 'кофе с другом' });

      await sendText('кофе с другом двадцать пять тысяч');

      expect(toldDay()).toBe('2026-10-29');
      expect(await storedDates()).toEqual(['2026-10-29']);
    });
  });

  describe('voice', () => {
    it('tells the AI the day it was sent, and dates a record without a day by it', async () => {
      aiAnswers({ amount: 18000, category: 'Транспорт', description: 'такси' });

      await sendVoice('такси восемнадцать тысяч');

      expect(toldDay()).toBe('2026-10-29');
      expect(await storedDates()).toEqual(['2026-10-29']);
      expect(sent()[sent().length - 1]).toContain(`29${NB}октября`);
    });

    it('«вчера» is counted from the day it was sent', async () => {
      aiAnswers({ amount: 18000, category: 'Транспорт', description: 'такси', daysBack: 1 });

      await sendVoice('вчера такси восемнадцать тысяч');

      expect(await storedDates()).toEqual(['2026-10-28']);
    });
  });

  describe('beyond the limits of a phone\'s time of input (FT-175): the server\'s clock is off', () => {
    // Telegram's clock is right and it keeps a message 24 hours: off the limits, the server's day would be the wrong one
    // (decision 2026-10-30). Each such message is logged
    const clockWarnings = () => warn.mock.calls.filter(([text]) => String(text).includes('server clock'));

    it('a message sent more than 30 days ago is written on the day it was sent, not refused', async () => {
      const longAgo = new Date('2026-09-25T12:00:00+05:00');
      aiAnswers({ amount: 18000, category: 'Транспорт', description: 'такси' });

      await sendText('такси 18000', longAgo);
      await sendVoice('такси восемнадцать тысяч', longAgo);
      await quickAddCafe();
      await sendText('500', longAgo);

      expect(await storedDates()).toEqual(['2026-09-25', '2026-09-25', '2026-09-25']);
      expect(toldDay()).toBe('2026-09-25');
      expect(sent().join('\n')).not.toMatch(/❌|30 days|capturedAt/);
      expect(clockWarnings()).toHaveLength(3);
    });

    it('a message ahead of the server\'s clock is its own day: WSL lags after a sleep', async () => {
      // The PC woke at 08:00 on Friday, WSL still says Thursday 23:30; the message was sent at 07:30 on Friday
      jest.setSystemTime(new Date('2026-10-29T23:30:00+05:00'));
      const fridayEarly = new Date('2026-10-30T07:30:00+05:00');
      aiAnswers({ amount: 18000, category: 'Транспорт', description: 'такси' });

      await sendText('такси 18000', fridayEarly);
      await sendVoice('такси восемнадцать тысяч', fridayEarly);
      await quickAddCafe();
      await sendText('500', fridayEarly);

      expect(await storedDates()).toEqual(['2026-10-30', '2026-10-30', '2026-10-30']);
      expect(clockWarnings()).toEqual([
        [expect.any(String), expect.objectContaining({ category: 'TELEGRAM_MSG', aheadMinutes: 480 })],
        [expect.any(String), expect.objectContaining({ aheadMinutes: 480 })],
        [expect.any(String), expect.objectContaining({ aheadMinutes: 480 })],
      ]);
    });

    it('a message more than a day ahead of the server\'s clock is its own day too', async () => {
      // WSL slept through a day: it says Wednesday, the message was sent on Friday
      jest.setSystemTime(new Date('2026-10-28T08:00:00+05:00'));
      const fridayEarly = new Date('2026-10-30T07:30:00+05:00');
      aiAnswers({ amount: 18000, category: 'Транспорт', description: 'такси' });

      await sendText('такси 18000', fridayEarly);
      await sendVoice('такси восемнадцать тысяч', fridayEarly);

      expect(await storedDates()).toEqual(['2026-10-30', '2026-10-30']);
      expect(toldDay()).toBe('2026-10-30');
      expect(clockWarnings()).toHaveLength(2);
    });

    it('a message read hours after it was sent is within the limits: nothing is logged', async () => {
      await sendText('такси 18000');

      expect(await storedDates()).toEqual(['2026-10-29']);
      expect(clockWarnings()).toEqual([]);
    });

    it('a message without a date is written on today, as before', async () => {
      aiAnswers({ amount: 18000, category: 'Транспорт', description: 'такси' });

      await sendText('такси 18000', null);
      await sendVoice('такси восемнадцать тысяч', null);

      expect(await storedDates()).toEqual(['2026-10-30', '2026-10-30']);
    });
  });

  describe('what else writes a record from a message', () => {
    it('the amount after a quick-add category is written on the day it was sent', async () => {
      await quickAddCafe();
      await sendText('500', THURSDAY_EVENING);

      expect(await storedDates()).toEqual(['2026-10-29']);
    });

    it('the answer to «Сколько?» is written on the day of the phrase that named the item', async () => {
      parser.analyzeInput.mockImplementation(async (_text: string, context: AnalysisContext = {}) => ({
        transactions: [],
        debts: [],
        withoutAmount: [{ description: 'такси', category: 'Транспорт', type: 'expense', date: context.today }],
      }));
      await sendText('такси');

      await sendText('18 тысяч', FRIDAY_MORNING);

      expect(await storedDates()).toEqual(['2026-10-29']);
    });

    it('an edited message writes nothing: the bot does not read edits', async () => {
      const edited = {
        message_id: 99, date: unixSeconds(THURSDAY_EVENING), edit_date: unixSeconds(FRIDAY_MORNING), chat: stand.chat,
        from: { id: TELEGRAM_ID, is_bot: false, first_name: 'Shukur' }, text: 'такси 18000',
      };

      await stand.deliver({ update_id: 900, edited_message: edited } as Update);

      expect(await storedDates()).toEqual([]);
      expect(sent()).toEqual([]);
    });

    it('the buttons under the confirmation keep the day: «Отменить», then «Вернуть»', async () => {
      await sendText('такси 18000');
      const confirmation = lastBotMessage();

      await press(confirmation, 'Отменить');
      expect(await storedDates()).toEqual([]);
      await press(confirmation, 'Вернуть');

      expect(await storedDates()).toEqual(['2026-10-29']);
    });
  });
});
