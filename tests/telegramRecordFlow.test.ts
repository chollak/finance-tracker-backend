import 'reflect-metadata';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DataSource } from 'typeorm';
import { createAppDataSource } from '../src/shared/infrastructure/database/database.config';
import { runMigrationsWithBackup } from '../src/shared/infrastructure/database/migrationRunner';
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
import { closeAmountQuestionOnCommand, registerRecordHandlers } from '../src/delivery/messaging/telegram/handlers/recordHandlers';
import { registerCallbackHandlers } from '../src/delivery/messaging/telegram/handlers/callbackHandlers';
import { registerMessageHandlers } from '../src/delivery/messaging/telegram/handlers/messageHandlers';
import { resolveUserIdToUUID } from '../src/shared/application/helpers/userIdResolver';
import { addDaysToDateOnly, todayDateOnly } from '../src/shared/domain/dates/dateOnly';
import { absoluteDate } from '../src/delivery/messaging/telegram/formatters/recordMessage';
import { CaptureAssumption } from '../src/modules/voiceProcessing/domain/processedTransaction';
import { ProcessVoiceOptions } from '../src/modules/voiceProcessing/application/processVoiceInput';
import { VoiceInput } from '../src/modules/voiceProcessing/domain/voiceInput';

// A voice message is not downloaded in tests; what it «says» is set by the test
jest.mock('../src/delivery/messaging/telegram/utils', () => ({
  downloadVoiceFile: jest.fn(async (_url: string, fileId: string) => `/tmp/voice/${fileId}.ogg`),
  cleanupFile: jest.fn(async () => undefined),
}));

/**
 * FT-122 end to end on a real SQLite file: a phrase in the chat → one confirmation; «Изменить» → a
 * field in two presses; «Отменить» → struck through with «Вернуть»; /undo; and all of it after the bot
 * restarts. Telegram is a fake chat that keeps the messages the bot sent and edited; the handlers are
 * registered the way telegramBot.ts registers them, and every update runs through that chain.
 */

const NB = ' ';
const MINUS = '−';
const TELEGRAM_ID = 131184740;

interface Button { text: string; callback_data?: string; web_app?: { url: string } }
interface ChatMessage { text: string; keyboard: Button[][] }

/** What a capture of the phrase should write — the parser is not under test here. */
interface PlannedRecord {
  amountMinor: number;
  category: string;
  description: string;
  type?: 'income' | 'expense';
  account?: string;
  currency?: 'UZS' | 'USD';
  guessed?: boolean;
}

type Middleware = (ctx: any, next: () => Promise<void>) => Promise<void> | void;

async function run(chain: Middleware[], ctx: any): Promise<void> {
  const step = async (index: number): Promise<void> => {
    if (index < chain.length) await chain[index](ctx, () => step(index + 1));
  };
  await step(0);
}

class Bot {
  readonly actions: Array<{ trigger: RegExp | string; handler: (ctx: any) => Promise<void> }> = [];
  readonly commands = new Map<string, (ctx: any) => Promise<void>>();
  readonly middleware: Middleware[] = [];
  readonly handlers: Array<{ filter: (update: any) => boolean; chain: Middleware[] }> = [];

  use(middleware: Middleware) {
    this.middleware.push(middleware);
  }

  on(filter: (update: any) => boolean, ...chain: Middleware[]) {
    this.handlers.push({ filter, chain });
  }

  action(trigger: RegExp | string, handler: (ctx: any) => Promise<void>) {
    this.actions.push({ trigger, handler });
  }

  command(name: string, handler: (ctx: any) => Promise<void>) {
    this.commands.set(name, handler);
  }

  /** A message the way Telegraf runs it: the middleware first, then its command or the first handler that matches. */
  async handle(ctx: any): Promise<void> {
    const text: unknown = ctx.message?.text;
    const command = typeof text === 'string' && text.startsWith('/') ? this.commands.get(text.slice(1).split(/\s/)[0]) : undefined;
    const tail: Middleware[] = command
      ? [async (c: any) => command(c)]
      : this.handlers.find(({ filter }) => filter(ctx.update))?.chain ?? [];
    await run([...this.middleware, ...tail], ctx);
  }
}

/** What the free limit says for the next record (FT-091: off by default, on here when a test says so). */
interface LimitAnswer { allowed: boolean }

interface Running {
  ds: DataSource;
  modules: Record<string, unknown>;
  transactionModule: TransactionModule;
  accountModule: AccountModule;
  categoryModule: CategoryModule;
  userModule: UserModule;
  botMessageModule: BotMessageModule;
  bot: Bot;
  capture: jest.Mock;
  voice: jest.Mock;
}

describe('bot record messages (FT-122)', () => {
  let dir: string;
  let file: string;
  let running: Running;
  let userId: string;
  const open: DataSource[] = [];
  const messages = new Map<number, ChatMessage>();
  let nextMessageId = 100;
  let plan: PlannedRecord[] = [];
  let heard = '';
  let limit: LimitAnswer = { allowed: true };
  const today = todayDateOnly();

  /** Writes the planned records the way the capture use cases do: through the create use case. */
  async function writePlan(transactionModule: TransactionModule, accountModule: AccountModule, owner: string) {
    const accounts = await accountModule.getBook().listForUser(owner);
    const transactions = [];
    for (const planned of plan) {
      const created = await transactionModule.getCreateTransactionUseCase().execute({
        userId: owner,
        amountMinor: planned.amountMinor,
        category: planned.category,
        type: planned.type ?? 'expense',
        description: planned.description,
        date: today,
        source: 'telegram',
        accountId: accounts.find(account => account.name === (planned.account ?? 'Карта'))?.id,
        currency: planned.currency,
      } as any);
      if (!created.success) throw created.error;
      const assumptions: CaptureAssumption[] = planned.guessed ? [{ kind: 'category', name: planned.category }] : [];
      transactions.push({ id: created.data, amount: planned.amountMinor / 100, type: planned.type ?? 'expense', category: planned.category, date: today, assumptions });
    }
    return transactions;
  }

  async function start(): Promise<Running> {
    const ds = createAppDataSource(file);
    open.push(ds);
    await ds.initialize();
    await runMigrationsWithBackup(ds, file, path.join(dir, 'backups'));

    const categoryModule = new CategoryModule(new SqliteCategoryRepository(ds));
    const accountModule = new AccountModule(new SqliteAccountRepository(ds), undefined, new SqliteAccountMoveRepository(ds));
    const transactionModule = new TransactionModule(new SqliteTransactionRepository(ds));
    transactionModule.setCategoryResolver(categoryModule.getCatalog());
    transactionModule.setAccountResolver(accountModule.getBook());
    const userModule = new UserModule(new SqliteUserRepository(ds), new SqliteUserSettingsRepository(ds));
    const botMessageModule = new BotMessageModule(new SqliteBotMessageRepository(ds));

    // The capture writes the planned records the way QuickCaptureService does
    const capture = jest.fn(async ({ userId: owner }: { userId: string }) => ({
      transactions: await writePlan(transactionModule, accountModule, owner),
      debts: [],
    }));
    // The voice use case: what was heard goes to the caller first, as ProcessVoiceInputUseCase does
    const voice = jest.fn(async (input: VoiceInput, options: ProcessVoiceOptions = {}) => {
      if (await options.takeHeardText?.(heard)) return { text: heard, transactions: [], debts: [] };
      return { text: heard, transactions: await writePlan(transactionModule, accountModule, input.userId), debts: [] };
    });
    const subscriptionModule = {
      getCheckLimitUseCase: () => ({
        execute: async () => ({ ...limit, isPremium: false, currentUsage: 50, limit: 50, remaining: 0, message: 'Лимит записей исчерпан.' }),
      }),
      getIncrementUsageUseCase: () => ({ execute: async () => undefined }),
    };

    // In the order telegramBot.ts registers them
    const bot = new Bot();
    bot.use(closeAmountQuestionOnCommand);
    registerRecordHandlers(bot as any);
    registerCallbackHandlers(bot as any);
    registerMessageHandlers(bot as any, subscriptionModule as any, userModule);

    return {
      ds,
      transactionModule,
      accountModule,
      categoryModule,
      userModule,
      botMessageModule,
      bot,
      capture,
      voice,
      modules: {
        transactionModule,
        accountModule,
        categoryModule,
        userModule,
        botMessageModule,
        quickCaptureModule: { getQuickCaptureService: () => ({ capture }) },
        voiceModule: { getProcessVoiceInputUseCase: () => ({ execute: voice }) },
      },
    };
  }

  /** The bot process stops: the connection closes; what is in memory is gone. */
  async function restart(): Promise<void> {
    await running.ds.destroy();
    running = await start();
  }

  function baseContext() {
    return {
      from: { id: TELEGRAM_ID, first_name: 'Shukur' },
      chat: { id: TELEGRAM_ID },
      session: {},
      modules: running.modules,
      sendChatAction: jest.fn().mockResolvedValue(undefined),
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn(async (text: string, extra?: any) => {
        const messageId = nextMessageId++;
        messages.set(messageId, { text, keyboard: extra?.reply_markup?.inline_keyboard ?? [] });
        return { message_id: messageId, chat: { id: TELEGRAM_ID } };
      }),
      telegram: {
        editMessageText: jest.fn(async (_chat: string, messageId: number, _inline: unknown, text: string, extra?: any) => {
          messages.set(messageId, { text, keyboard: extra?.reply_markup?.inline_keyboard ?? [] });
          return true;
        }),
        getFileLink: jest.fn(async () => ({ href: 'https://telegram.test/voice.ogg' })),
      },
    };
  }

  /** The person writes in the chat; returns the id of the bot's last message. */
  async function write(text: string, records: PlannedRecord[] = []): Promise<number> {
    plan = records;
    nextMessageId += 1; // the person's own message takes an id too
    const message = { text };
    await running.bot.handle({ ...baseContext(), message, update: { message } });
    return nextMessageId - 1;
  }

  /** The person sends a voice message that is heard as `words`; returns the id of the bot's last message. */
  async function say(words: string, records: PlannedRecord[] = []): Promise<number> {
    plan = records;
    heard = words;
    nextMessageId += 1;
    const message = { voice: { file_id: `voice-${nextMessageId}` } };
    await running.bot.handle({ ...baseContext(), message, update: { message } });
    return nextMessageId - 1;
  }

  function awaiting() {
    return running.botMessageModule.getLog().awaitingAmount(String(TELEGRAM_ID));
  }

  async function pressData(messageId: number, data: string) {
    const ctx: any = { ...baseContext(), callbackQuery: { data, message: { message_id: messageId, chat: { id: TELEGRAM_ID } } } };
    const action = running.bot.actions.find(({ trigger }) => (typeof trigger === 'string' ? trigger === data : trigger.test(data)));
    if (!action) throw new Error(`No handler for ${data}`);
    ctx.match = typeof action.trigger === 'string' ? [data] : action.trigger.exec(data);
    await action.handler(ctx);
    return ctx;
  }

  async function press(messageId: number, label: string) {
    const button = messages.get(messageId)!.keyboard.flat().find(candidate => candidate.text === label);
    if (!button?.callback_data) throw new Error(`No button «${label}» under message ${messageId}: ${JSON.stringify(labels(messageId))}`);
    return pressData(messageId, button.callback_data);
  }

  function text(messageId: number): string {
    return messages.get(messageId)!.text;
  }

  function labels(messageId: number): string[][] {
    return messages.get(messageId)!.keyboard.map(row => row.map(button => button.text));
  }

  async function record(id: string) {
    const found = await running.transactionModule.getGetTransactionByIdUseCase().execute(id, { includeDeleted: true });
    if (!found.success) throw found.error;
    return found.data;
  }

  async function recordIdsOf(messageId: number): Promise<string[]> {
    return (await running.botMessageModule.getLog().find(String(TELEGRAM_ID), messageId))!.recordIds;
  }

  const taxi: PlannedRecord = { amountMinor: 1_800_000, category: 'Транспорт', description: 'такси', account: 'Наличные' };
  const lunch: PlannedRecord = { amountMinor: 14_500_000, category: 'Кафе', description: 'Обед с командой' };
  const coffee: PlannedRecord = { amountMinor: 2_500_000, category: 'Кафе', description: 'кофе' };

  beforeEach(async () => {
    limit = { allowed: true };
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft122-flow-'));
    file = path.join(dir, 'db.sqlite');
    messages.clear();
    jest.spyOn(AppConfig, 'getWebAppUrl').mockReturnValue('https://miniapp.test');
    running = await start();
    userId = await resolveUserIdToUUID(String(TELEGRAM_ID), running.userModule);
    await running.accountModule.getBook().listForUser(userId); // «Карта»
    for (const body of [{ name: 'Наличные', kind: 'cash', currency: 'UZS' }, { name: 'Доллары', kind: 'card', currency: 'USD' }]) {
      const created = await running.accountModule.getCreateAccountUseCase().execute({ userId, body });
      if (!created.success) throw created.error;
    }
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    for (const ds of open.splice(0)) if (ds.isInitialized) await ds.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('confirms a phrase with several records in one message and remembers which records it shows', async () => {
    const message = await write('кофе 25к, такси 18к', [coffee, { ...taxi, account: 'Карта' }]);

    expect(text(message)).toBe(
      `<b>Расходы ${MINUS}43${NB}000${NB}сум · 2 записи</b>\n`
      + `${MINUS}25${NB}000 · Кафе · «Кофе»\n`
      + `${MINUS}18${NB}000 · Транспорт · «Такси»\n`
      + `Карта · ${absoluteDate(today, today)}`
    );
    expect(labels(message)).toEqual([[`${MINUS}25${NB}000 · «Кофе»`], [`${MINUS}18${NB}000 · «Такси»`], ['Отменить все']]);
    expect(await recordIdsOf(message)).toHaveLength(2);
    expect([...messages.values()].filter(sent => sent.text.includes('Кофе'))).toHaveLength(1);
  });

  it('«Изменить» → «Категорию» → a category: two presses to the field, then the record changes', async () => {
    const message = await write('такси 18к нал', [taxi]);
    const [id] = await recordIdsOf(message);

    await press(message, 'Изменить');
    expect(labels(message)[0]).toEqual(['Сумму', 'Категорию']);
    await press(message, 'Категорию');
    expect(labels(message)[0]).toEqual(['Продукты', 'Кафе']);
    expect(labels(message).flat()).toContain('✓ Транспорт');

    await press(message, 'Кафе');

    expect((await record(id)).category).toBe('Кафе');
    expect(text(message)).toContain('Кафе · «Такси»');
    expect(text(message)).toMatch(/<i>Категория: Кафе\.<\/i>$/);
    expect(labels(message)).toEqual([['Изменить', 'Отменить']]);
  });

  it('«Это доход» switches the record to income only once an income category is picked', async () => {
    const message = await write('обед с командой 145к', [lunch]);
    const [id] = await recordIdsOf(message);
    await press(message, 'Изменить');
    await press(message, 'Категорию');

    await press(message, 'Это доход');
    expect((await record(id)).type).toBe('expense');
    expect(labels(message)[0]).toEqual(['Зарплата', 'Фриланс']);

    await press(message, 'Фриланс');

    const changed = await record(id);
    expect(changed).toEqual(expect.objectContaining({ type: 'income', semanticType: 'income', category: 'Фриланс' }));
    expect(text(message)).toContain(`<b>Доход +145${NB}000${NB}сум</b>`);
    expect(text(message)).toContain('Теперь это доход. Категория: Фриланс.');
  });

  it('«Счёт» offers the accounts in the record’s currency and moves the record', async () => {
    const message = await write('обед 145к', [lunch]);
    const [id] = await recordIdsOf(message);
    await press(message, 'Изменить');
    await press(message, 'Счёт');

    expect(labels(message)).toEqual([['✓ Карта', 'Наличные'], ['‹ Назад']]);
    await press(message, 'Наличные');

    const accounts = await running.accountModule.getBook().listForUser(userId);
    expect((await record(id)).accountId).toBe(accounts.find(account => account.name === 'Наличные')!.id);
    expect(text(message)).toContain(`Наличные · ${absoluteDate(today, today)}`);
    expect(text(message)).toContain('Счёт: Наличные.');
  });

  it('«Дату» → «Вчера» moves the record a day back and writes the date itself', async () => {
    const message = await write('обед 145к', [lunch]);
    const [id] = await recordIdsOf(message);
    const yesterday = addDaysToDateOnly(today, -1);
    await press(message, 'Изменить');
    await press(message, 'Дату');

    expect(labels(message)[0]).toEqual(['✓ Сегодня', 'Вчера']);
    await press(message, 'Вчера');

    expect((await record(id)).date).toBe(yesterday);
    expect(text(message)).toContain(`Карта · ${absoluteDate(yesterday, today)}`);
    expect(text(message)).toContain(`Дата: ${absoluteDate(yesterday, today)}.`);
  });

  it('«Сумму» takes the next text as the new amount and says what changed', async () => {
    const message = await write('обед с командой 145к', [lunch]);
    const [id] = await recordIdsOf(message);
    await press(message, 'Изменить');
    await press(message, 'Сумму');
    expect(text(message)).toMatch(/<b>Напишите новую сумму — например, 150к\.<\/b>$/);

    const reply = await write('150к');

    expect(running.capture).toHaveBeenCalledTimes(1); // only the phrase itself
    expect((await record(id)).amountMinor).toBe(15_000_000);
    expect(text(reply)).toBe(`Изменил: ${MINUS}150${NB}000${NB}сум · «Обед с командой»`);
    expect(text(message)).toContain(`<b>Расход ${MINUS}150${NB}000${NB}сум</b>`);
    expect(text(message)).toContain(`<i>Сумма изменена: было 145${NB}000.</i>`);
    expect(labels(message)).toEqual([['Изменить', 'Отменить']]);
  });

  it('reads «45» as 45 000 сум and says so', async () => {
    const message = await write('обед с командой 145к', [lunch]);
    const [id] = await recordIdsOf(message);
    await press(message, 'Изменить');
    await press(message, 'Сумму');

    const reply = await write('45');

    expect((await record(id)).amountMinor).toBe(4_500_000);
    expect(text(reply)).toBe(`Изменил: ${MINUS}45${NB}000${NB}сум · «Обед с командой». «45» понял как 45${NB}000${NB}сум`);
  });

  it('a dollar amount moves a сум record to the dollar account', async () => {
    const message = await write('наушники 600к', [{ amountMinor: 60_000_000, category: 'Покупки', description: 'наушники' }]);
    const [id] = await recordIdsOf(message);
    await press(message, 'Изменить');
    await press(message, 'Сумму');

    await write('55$');

    const accounts = await running.accountModule.getBook().listForUser(userId);
    expect(await record(id)).toEqual(expect.objectContaining({
      amountMinor: 5_500,
      currency: 'USD',
      accountId: accounts.find(account => account.name === 'Доллары')!.id,
    }));
    expect(text(message)).toContain(`<b>Расход ${MINUS}55,00${NB}USD</b>`);
    expect(text(message)).toContain('Доллары · ');
  });

  it('keeps waiting for the amount after zero, and refuses dollars without a dollar account', async () => {
    const accounts = await running.accountModule.getBook().listForUser(userId);
    const dollars = accounts.find(account => account.name === 'Доллары')!;
    const message = await write('обед 145к', [lunch]);
    const [id] = await recordIdsOf(message);
    await press(message, 'Изменить');
    await press(message, 'Сумму');

    expect(text(await write('0'))).toBe('Сумма должна быть больше нуля.');
    const hidden = await running.accountModule.getUpdateAccountUseCase().execute({ userId, accountId: dollars.id, body: { isHidden: true } });
    expect(hidden.success).toBe(true);
    expect(text(await write('55$'))).toBe('Счёта в долларах нет — добавьте его в Daftar.');

    expect((await record(id)).amountMinor).toBe(14_500_000);
    expect((await running.botMessageModule.getLog().awaitingAmount(String(TELEGRAM_ID)))?.messageId).toBe(message);
  });

  it('closes the amount question when the next text is something else, and records that text', async () => {
    const message = await write('обед с командой 145к', [lunch]);
    const [id] = await recordIdsOf(message);
    await press(message, 'Изменить');
    await press(message, 'Сумму');

    await write('кофе 25к', [coffee]);

    expect(running.capture).toHaveBeenCalledTimes(2);
    expect((await record(id)).amountMinor).toBe(14_500_000);
    expect(labels(message)[0]).toEqual(['Сумму', 'Категорию']);
    expect(await running.botMessageModule.getLog().awaitingAmount(String(TELEGRAM_ID))).toBeNull();
  });

  it('a voice message that is not an amount closes the question: a later number does not touch the record', async () => {
    const message = await write('обед с командой 145к', [lunch]);
    const [id] = await recordIdsOf(message);
    await press(message, 'Изменить');
    await press(message, 'Сумму');

    const voiceReply = await say('такси двадцать тысяч', [{ ...taxi, amountMinor: 2_000_000 }]);

    expect(await awaiting()).toBeNull();
    expect(labels(message)[0]).toEqual(['Сумму', 'Категорию']);
    expect(text(message)).not.toContain('Напишите новую сумму');
    expect(text(voiceReply)).toContain(`<b>Расход ${MINUS}20${NB}000${NB}сум</b>`);
    expect(text(voiceReply)).toContain('Расслышал: «такси двадцать тысяч»');

    await write('300');

    expect((await record(id)).amountMinor).toBe(14_500_000);
    expect(running.capture).toHaveBeenCalledTimes(2); // «300» is a phrase of its own now
  });

  it('a voice message that is only an amount answers the question, as text does', async () => {
    const message = await write('обед с командой 145к', [lunch]);
    const [id] = await recordIdsOf(message);
    await press(message, 'Изменить');
    await press(message, 'Сумму');

    const reply = await say('150 тысяч.', [coffee]);

    expect((await record(id)).amountMinor).toBe(15_000_000);
    expect(text(reply)).toBe(`Изменил: ${MINUS}150${NB}000${NB}сум · «Обед с командой»`);
    expect(text(message)).toContain(`<i>Сумма изменена: было 145${NB}000.</i>`);
    // Nothing was written from it
    expect([...messages.values()].some(sent => sent.text.includes('«Кофе»'))).toBe(false);
    expect(await awaiting()).toBeNull();
  });

  it('a command closes the question before it runs', async () => {
    const message = await write('обед с командой 145к', [lunch]);
    const [id] = await recordIdsOf(message);
    await press(message, 'Изменить');
    await press(message, 'Сумму');

    await write('/today');

    expect(await awaiting()).toBeNull();
    expect(labels(message)[0]).toEqual(['Сумму', 'Категорию']);
    await write('300');
    expect((await record(id)).amountMinor).toBe(14_500_000);
  });

  it('/undo of the record whose amount is asked closes the question and cancels it', async () => {
    const message = await write('обед с командой 145к', [lunch]);
    const [id] = await recordIdsOf(message);
    await press(message, 'Изменить');
    await press(message, 'Сумму');

    await write('/undo');

    expect(await awaiting()).toBeNull();
    expect((await record(id)).deletedAt).toBeTruthy();
    expect(labels(message)).toEqual([['Вернуть']]);
  });

  it('answers «Сумму» even when the free limit of records is reached: it corrects a record, it adds none', async () => {
    const message = await write('обед с командой 145к', [lunch]);
    const [id] = await recordIdsOf(message);
    await press(message, 'Изменить');
    await press(message, 'Сумму');
    limit = { allowed: false };

    const reply = await write('150к');

    expect((await record(id)).amountMinor).toBe(15_000_000);
    expect(text(reply)).toBe(`Изменил: ${MINUS}150${NB}000${NB}сум · «Обед с командой»`);

    // A new phrase still meets the limit
    const paywall = await write('кофе 25к', [coffee]);
    expect(text(paywall)).toContain('Лимит записей исчерпан.');
    expect(running.capture).toHaveBeenCalledTimes(1);
  });

  it('reads «45» as 45 000 сум for an income too', async () => {
    const message = await write('фриланс 300к', [{ amountMinor: 30_000_000, category: 'Фриланс', description: 'фриланс', type: 'income' }]);
    const [id] = await recordIdsOf(message);
    await press(message, 'Изменить');
    await press(message, 'Сумму');

    const reply = await write('45');

    expect((await record(id)).amountMinor).toBe(4_500_000);
    expect(text(reply)).toBe(`Изменил: +45${NB}000${NB}сум · «Фриланс». «45» понял как 45${NB}000${NB}сум`);
  });

  it('«150к» under a dollar record is сум: the record moves to a сум account', async () => {
    const message = await write('наушники 60$', [{ amountMinor: 6_000, category: 'Покупки', description: 'наушники', account: 'Доллары', currency: 'USD' }]);
    const [id] = await recordIdsOf(message);
    await press(message, 'Изменить');
    await press(message, 'Сумму');
    expect(text(message)).toMatch(/например, 60\$\.<\/b>$/);

    await write('150к');

    const accounts = await running.accountModule.getBook().listForUser(userId);
    expect(await record(id)).toEqual(expect.objectContaining({
      amountMinor: 15_000_000,
      currency: 'UZS',
      accountId: accounts.find(account => account.name === 'Карта')!.id,
    }));
    expect(text(message)).toContain(`<b>Расход ${MINUS}150${NB}000${NB}сум</b>`);
  });

  it('«18к нал» answers the question and moves the record to cash', async () => {
    const message = await write('такси 25к', [{ ...taxi, amountMinor: 2_500_000, account: 'Карта' }]);
    const [id] = await recordIdsOf(message);
    await press(message, 'Изменить');
    await press(message, 'Сумму');

    const reply = await write('18к нал');

    const accounts = await running.accountModule.getBook().listForUser(userId);
    expect(running.capture).toHaveBeenCalledTimes(1);
    expect(await record(id)).toEqual(expect.objectContaining({
      amountMinor: 1_800_000,
      accountId: accounts.find(account => account.name === 'Наличные')!.id,
    }));
    expect(text(reply)).toBe(`Изменил: ${MINUS}18${NB}000${NB}сум · «Такси»`);
    expect(text(message)).toContain(`Наличные · ${absoluteDate(today, today)}`);
  });

  it('a picker of a record deleted in the app meanwhile draws the record cancelled instead of failing', async () => {
    const message = await write('такси 18к нал', [taxi]);
    const [id] = await recordIdsOf(message);
    await press(message, 'Изменить');
    await press(message, 'Категорию');
    const deleted = await running.transactionModule.getDeleteTransactionUseCase().execute({ id });
    expect(deleted.success).toBe(true);

    const ctx = await press(message, 'Кафе');

    expect(ctx.answerCbQuery).not.toHaveBeenCalledWith('Произошла ошибка. Попробуйте снова.');
    expect((await record(id)).deletedAt).toBeTruthy();
    expect(text(message)).toContain('Отменено — в приложении этой записи нет.');
    expect(labels(message)).toEqual([['Вернуть']]);
  });

  it('«Отменить «…»» of a record deleted in the app meanwhile does not cancel the other records', async () => {
    const message = await write('кофе 25к, такси 18к', [coffee, taxi]);
    const [coffeeId, taxiId] = await recordIdsOf(message);
    await press(message, `${MINUS}18${NB}000 · «Такси»`);
    await running.transactionModule.getDeleteTransactionUseCase().execute({ id: taxiId });

    await press(message, 'Отменить «Такси»');

    expect((await record(coffeeId)).deletedAt).toBeFalsy();
    expect(labels(message)).toEqual([[`${MINUS}25${NB}000 · «Кофе»`], ['Вернуть «Такси»'], ['Отменить все']]);
  });

  it('a stale «Вернуть» on a record already back says nothing came back', async () => {
    const message = await write('такси 18к нал', [taxi]);
    const [id] = await recordIdsOf(message);
    await press(message, 'Отменить');
    const restored = await running.transactionModule.getRestoreTransactionUseCase().execute({ id });
    expect(restored.success).toBe(true);

    await press(message, 'Вернуть');

    expect(text(message)).not.toContain('возвращена');
    expect(labels(message)).toEqual([['Изменить', 'Отменить']]);
  });

  it('«Отменить» strikes the record through and «Вернуть» brings it back', async () => {
    const message = await write('такси 18к нал', [taxi]);
    const [id] = await recordIdsOf(message);

    await press(message, 'Отменить');

    expect((await record(id)).deletedAt).toBeTruthy();
    expect(await running.transactionModule.getRepository().findById(id)).toBeNull();
    expect(text(message)).toContain(`<s><b>Расход ${MINUS}18${NB}000${NB}сум</b></s>`);
    expect(text(message)).toContain('Отменено — в приложении этой записи нет.');
    expect(labels(message)).toEqual([['Вернуть']]);

    await press(message, 'Вернуть');

    expect((await record(id)).deletedAt).toBeFalsy();
    expect(text(message)).not.toContain('<s>');
    expect(text(message)).toMatch(/<i>Запись возвращена\.<\/i>$/);
    expect(labels(message)).toEqual([['Изменить', 'Отменить']]);
  });

  it('cancels one record of several from its own «Изменить»', async () => {
    const message = await write('кофе 25к, такси 18к', [coffee, taxi]);
    const [coffeeId, taxiId] = await recordIdsOf(message);

    await press(message, `${MINUS}18${NB}000 · «Такси»`);
    expect(text(message)).toMatch(/<i>Меняем «Такси»\. Что именно\?<\/i>$/);
    await press(message, 'Отменить «Такси»');

    expect((await record(taxiId)).deletedAt).toBeTruthy();
    expect((await record(coffeeId)).deletedAt).toBeFalsy();
    expect(labels(message)).toEqual([[`${MINUS}25${NB}000 · «Кофе»`], ['Вернуть «Такси»'], ['Отменить все']]);
  });

  it('/undo cancels the chat’s last record, says what it cancelled and offers «Вернуть»', async () => {
    const first = await write('кофе 25к', [coffee]);
    const second = await write('такси 18к нал', [taxi]);
    const [taxiId] = await recordIdsOf(second);

    const reply = await write('/undo');

    expect((await record(taxiId)).deletedAt).toBeTruthy();
    expect(text(reply)).toBe(`Отменил последнюю запись: ${MINUS}18${NB}000${NB}сум · «Такси»`);
    expect(labels(reply)).toEqual([['Вернуть']]);
    expect(text(second)).toContain('Отменено — в приложении этой записи нет.');
    expect(labels(second)).toEqual([['Вернуть']]);
    expect(text(first)).not.toContain('Отменено');

    await press(reply, 'Вернуть');

    expect((await record(taxiId)).deletedAt).toBeFalsy();
    expect(text(reply)).toBe('Вернул запись.');
    expect(labels(reply)).toEqual([]);
    expect(text(second)).toMatch(/<i>Запись возвращена\.<\/i>$/);
  });

  it('/undo again goes one record further back, and says when there is nothing left', async () => {
    const first = await write('кофе 25к', [coffee]);
    await write('такси 18к нал', [taxi]);

    await write('/undo');
    const again = await write('/undo');

    expect(text(again)).toContain('«Кофе»');
    expect(text(first)).toContain('Отменено');
    expect(text(await write('/undo'))).toBe('Отменять нечего: записей из чата пока нет.');
  });

  it('«Вернуть» under the /undo reply brings back only what /undo cancelled', async () => {
    const message = await write('кофе 25к, такси 18к', [coffee, taxi]);
    const [coffeeId, taxiId] = await recordIdsOf(message);
    await press(message, `${MINUS}18${NB}000 · «Такси»`);
    await press(message, 'Отменить «Такси»');

    const reply = await write('/undo');
    expect(text(reply)).toBe(`Отменил последнюю запись: ${MINUS}25${NB}000${NB}сум · «Кофе»`);
    expect(labels(message)).toEqual([['Вернуть']]); // one record comes back

    await press(reply, 'Вернуть');

    expect((await record(coffeeId)).deletedAt).toBeFalsy();
    expect((await record(taxiId)).deletedAt).toBeTruthy();
    expect(text(reply)).toBe('Вернул запись.');
    expect(text(message)).toMatch(/<i>Запись возвращена\.<\/i>$/);
    expect(labels(message)).toEqual([[`${MINUS}25${NB}000 · «Кофе»`], ['Вернуть «Такси»'], ['Отменить все']]);
  });

  it('«Вернуть» on the message after /undo also brings back only what /undo cancelled', async () => {
    const message = await write('кофе 25к, такси 18к', [coffee, taxi]);
    const [coffeeId, taxiId] = await recordIdsOf(message);
    await press(message, `${MINUS}18${NB}000 · «Такси»`);
    await press(message, 'Отменить «Такси»');
    const reply = await write('/undo');

    await press(message, 'Вернуть');

    expect((await record(coffeeId)).deletedAt).toBeFalsy();
    expect((await record(taxiId)).deletedAt).toBeTruthy();
    expect(text(reply)).toBe('Вернул запись.');

    // «Отменить все» then «Вернуть все» brings back both: the message's own cancel is not /undo's
    await press(message, 'Отменить все');
    expect(labels(message)).toEqual([['Вернуть все']]);
    await press(message, 'Вернуть все');
    expect((await record(taxiId)).deletedAt).toBeFalsy();
  });

  it('«Вернуть» under the cancelled record also closes the /undo reply', async () => {
    const message = await write('такси 18к нал', [taxi]);
    const reply = await write('/undo');

    await press(message, 'Вернуть');

    expect(text(reply)).toBe('Вернул запись.');
    expect(labels(message)).toEqual([['Изменить', 'Отменить']]);
  });

  it('keeps working after the bot restarts: the buttons, the amount question and /undo', async () => {
    const message = await write('обед с командой 145к', [lunch]);
    const [id] = await recordIdsOf(message);
    await press(message, 'Изменить');
    await press(message, 'Сумму');

    await restart();
    await write('150к');
    expect((await record(id)).amountMinor).toBe(15_000_000);

    await restart();
    await press(message, 'Изменить');
    await press(message, 'Категорию');
    await press(message, 'Продукты');
    expect((await record(id)).category).toBe('Продукты');

    await restart();
    const reply = await write('/undo');
    expect(text(reply)).toContain('«Обед с командой»');
    expect((await record(id)).deletedAt).toBeTruthy();
  });

  it('a button under a message it does not know, or of another person, changes nothing', async () => {
    const message = await write('такси 18к нал', [taxi]);
    const [id] = await recordIdsOf(message);
    const stranger = { ...baseContext(), from: { id: 555 } };
    await resolveUserIdToUUID('555', running.userModule);

    const ctx: any = { ...stranger, callbackQuery: { data: 'r:x', message: { message_id: message, chat: { id: TELEGRAM_ID } } } };
    const action = running.bot.actions.find(({ trigger }) => typeof trigger !== 'string' && trigger.test('r:x'))!;
    ctx.match = (action.trigger as RegExp).exec('r:x');
    await action.handler(ctx);

    expect(ctx.answerCbQuery).toHaveBeenCalledWith('Не нашёл эту запись.');
    expect((await record(id)).deletedAt).toBeFalsy();

    const unknown = await pressData(9999, 'r:x');
    expect(unknown.answerCbQuery).toHaveBeenCalledWith('Не нашёл эту запись.');
  });

  it('takes over the buttons of a confirmation sent before FT-122: «Удалить» cancels with «Вернуть»', async () => {
    plan = [taxi];
    const { transactions } = await running.capture({ userId });
    const old = nextMessageId++;
    messages.set(old, { text: '✅ <b>Записал</b>\nТакси · 18 000 сум', keyboard: [] });

    await pressData(old, `delete:${transactions[0].id}`);

    expect((await record(transactions[0].id)).deletedAt).toBeTruthy();
    expect(text(old)).toContain('Отменено — в приложении этой записи нет.');
    expect(labels(old)).toEqual([['Вернуть']]);

    const edited = nextMessageId++;
    await pressData(edited, `edit:${(await running.capture({ userId })).transactions[0].id}`);
    expect(labels(edited)[0]).toEqual(['Сумму', 'Категорию']);
  });

  it('answers every press so the button does not spin', async () => {
    const message = await write('такси 18к нал', [taxi]);

    const ctx = await press(message, 'Изменить');

    expect(ctx.answerCbQuery).toHaveBeenCalled();
  });
});
