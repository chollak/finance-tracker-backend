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
import { AuditModule } from '../src/modules/audit/auditModule';
import { SqliteAuditRepository } from '../src/modules/audit/infrastructure/SqliteAuditRepository';
import { SqliteGoalRepository } from '../src/modules/audit/infrastructure/SqliteGoalRepository';
import { AuditView } from '../src/modules/audit/application/auditViews';
import { NotificationModule } from '../src/modules/notification/notificationModule';
import { SqliteNotificationLogRepository } from '../src/modules/notification/infrastructure/SqliteNotificationLogRepository';
import { registerReminderHandlers, reminderSender } from '../src/delivery/messaging/telegram/handlers/reminderHandlers';
import { Result } from '../src/shared/domain/types/Result';
import { prototypeRecords } from './helpers/auditPrototype';

/**
 * FT-133 end to end on a real SQLite file (board «Бот · напоминания», BotNotice.md): a goal is told once at 80% of its
 * limit and once when it is exceeded; a subscription the day before its charge when «Напомнить» was pressed; the audit
 * on the 1st at the chosen time, and «Позже» brings it back once. Every notice goes out at most once — a second tick or
 * a restart does not repeat it — and only while its setting is on. Telegram is a fake that keeps what the bot sent; the
 * text is drawn by the bot's own sender, the buttons are pressed through the bot's own handlers.
 */

const NB = ' ';
const TELEGRAM_ID = '597843119';
const BASE_URL = 'https://miniapp.test';
const AUDIT_URL = `${BASE_URL}/audit?userId=${TELEGRAM_ID}`;

interface Button { text: string; callback_data?: string; web_app?: { url: string } }
interface Sent { chatId: string; text: string; keyboard: Button[][]; messageId: number }

function unwrap<T>(result: Result<T>): T {
  if (!result.success) throw result.error;
  return result.data;
}

const spendings = (n: number) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word = mod10 === 1 && mod100 !== 11 ? 'трата' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'траты' : 'трат';
  return `${n} ${word}`;
};

describe('goal, subscription and audit reminders in the bot (FT-133)', () => {
  let dir: string;
  let file: string;
  const open: DataSource[] = [];
  let clock: Date;
  let sent: Sent[];
  let refuse: Error | null;
  let nextMessageId: number;

  const telegram = {
    sendMessage: jest.fn(async (chatId: string, text: string, extra?: any) => {
      if (refuse) throw refuse;
      const message = { chatId: String(chatId), text, keyboard: extra?.reply_markup?.inline_keyboard ?? [], messageId: nextMessageId++ };
      sent.push(message);
      return { message_id: message.messageId, chat: { id: Number(chatId) } };
    }),
  };

  interface Running {
    ds: DataSource;
    transactionModule: TransactionModule;
    userModule: UserModule;
    auditModule: AuditModule;
    notificationModule: NotificationModule;
  }
  let running: Running;
  let owner: string;

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
    const periodTotals = transactionModule.getPeriodTotalsService();
    const auditModule = new AuditModule({
      audits: new SqliteAuditRepository(ds),
      goals: new SqliteGoalRepository(ds),
      sources: {
        recordsBetween: (userId, from, to) => transactionModule.getRepository().getByUserIdAndDateRange(userId, new Date(from), new Date(to)),
        firstRecordDate: userId => transactionModule.getRepository().findFirstRecordDate(userId),
        categories: userId => categoryModule.getCatalog().listForUser(userId),
        usdRateMinor: (userId, records) => periodTotals.usdRateFor(userId, records),
      },
      now: () => clock,
    });
    const notificationModule = new NotificationModule(
      new SqliteNotificationLogRepository(ds),
      { transactionModule, userModule, auditModule },
      () => clock
    );
    return { ds, transactionModule, userModule, auditModule, notificationModule };
  }

  /** The bot process stops and starts again over the same file. */
  async function restart(): Promise<void> {
    await running.ds.destroy();
    running = await start();
  }

  /** The clock reads this time in Tashkent (UTC+5). */
  function at(date: string, time: string): void {
    clock = new Date(`${date}T${time}:00+05:00`);
  }

  async function record(date: string, category: string, sum: number, note: string) {
    const created = await running.transactionModule.getCreateTransactionUseCase().execute({
      userId: owner, amountMinor: sum * 100, category, type: 'expense', description: note, date, source: 'telegram',
    } as any);
    if (!created.success) throw created.error;
    return created.data;
  }

  const audit = (today: string): Promise<AuditView> => running.auditModule.getCurrentAuditUseCase().execute({ userId: owner, today }).then(unwrap);
  const goalNamed = async (name: string) => (await new SqliteGoalRepository(running.ds).findByUserId(owner)).find(goal => goal.name === name);

  /**
   * The board's months (August, September, October 1–14) and the audit of September held on 14 October: «Такси» is
   * extra — «Вдвое меньше», a limit of 102 000 сум from the audit day; «Кинопоиск» is a subscription to cancel; the rest
   * is needed.
   */
  async function auditedOnOctober14(): Promise<void> {
    for (const row of prototypeRecords()) await record(row.date, row.categoryName, row.amountMinor / 100, row.note);
    at('2026-10-14', '14:00');
    let view = await audit('2026-10-14');
    for (const candidate of view.candidates) {
      const decision = candidate.name === 'Такси' || candidate.name === 'Кинопоиск' ? 'extra' : 'need';
      view = unwrap(await running.auditModule.getDecideAuditCandidateUseCase().execute({
        userId: owner, auditId: view.id!, candidateId: candidate.id, body: { decision }, today: '2026-10-14',
      }));
    }
    unwrap(await running.auditModule.getFinishAuditUseCase().execute({ userId: owner, auditId: view.id!, today: '2026-10-14' }));
  }

  /** «Напомнить 2 ноября» under «Кинопоиск» on the audit's result. */
  async function remindAboutKinopoisk(today = '2026-10-14') {
    const goal = (await goalNamed('Кинопоиск'))!;
    return unwrap(await running.auditModule.getUpdateGoalUseCase().execute({ userId: owner, goalId: goal.id, body: { subscription: 'remind' }, today }));
  }

  async function save(patch: Record<string, unknown>) {
    unwrap(await running.userModule.getUpdateUserSettingsUseCase().execute({ userId: owner, patch } as any));
  }

  async function tick() {
    return running.notificationModule.getReminders()!.tick(reminderSender(telegram as any));
  }

  const outcomes = async () => (await tick()).map(result => `${result.kind}:${result.outcome}`);

  /** A button under a message the bot sent, pressed through the bot's own handlers. */
  async function press(message: Sent, label: string) {
    const actions: Array<{ trigger: RegExp; handler: (ctx: any) => Promise<void> }> = [];
    registerReminderHandlers({ action: (trigger: RegExp, handler: any) => actions.push({ trigger, handler }) } as any);
    const data = message.keyboard.flat().find(button => button.text === label)!.callback_data!;
    const action = actions.find(({ trigger }) => trigger.test(data))!;
    const ctx: any = {
      from: { id: Number(TELEGRAM_ID) },
      match: action.trigger.exec(data),
      callbackQuery: { data, message: { message_id: message.messageId, chat: { id: Number(TELEGRAM_ID) } } },
      modules: { userModule: running.userModule, notificationModule: running.notificationModule },
      answerCbQuery: jest.fn().mockResolvedValue(true),
      editMessageText: jest.fn().mockResolvedValue(true),
      editMessageReplyMarkup: jest.fn().mockResolvedValue(true),
    };
    await action.handler(ctx);
    return ctx;
  }

  /** What the message became after a press: its text and its buttons. */
  function edited(ctx: any): { text: string; keyboard: Button[][] } {
    const [text, extra] = ctx.editMessageText.mock.calls[0];
    return { text, keyboard: extra.reply_markup.inline_keyboard };
  }

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft133-'));
    file = path.join(dir, 'db.sqlite');
    sent = [];
    refuse = null;
    nextMessageId = 900;
    telegram.sendMessage.mockClear();
    jest.spyOn(AppConfig, 'getWebAppUrl').mockReturnValue(BASE_URL);
    at('2026-08-01', '09:00');
    running = await start();
    owner = (await running.userModule.getGetOrCreateUserUseCase().execute({ telegramId: TELEGRAM_ID, firstName: 'Shukur' })).id;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    for (const ds of open.splice(0)) if (ds.isInitialized) await ds.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('a goal', () => {
    it('at 80% of its limit: the board\'s message, once — not on the next tick, not after a restart', async () => {
      await auditedOnOctober14();
      await record('2026-10-20', 'Транспорт', 30_000, 'Такси');
      at('2026-10-20', '12:00');
      expect(await tick()).toEqual([]);

      await record('2026-10-27', 'Транспорт', 30_000, 'Такси');
      at('2026-10-27', '12:30');
      const goal = (await goalNamed('Такси'))!;
      expect(await tick()).toEqual([{ userId: owner, kind: 'goal_near', period: goal.id, outcome: 'sent' }]);
      expect(sent).toHaveLength(1);
      expect(sent[0].chatId).toBe(TELEGRAM_ID);
      expect(sent[0].text).toBe([
        `<b>Цель «Такси»: 84${NB}000 из 102${NB}000${NB}сум</b>`,
        `До конца октября по лимиту осталось 18${NB}000${NB}сум.`,
        '',
        '<i>Напишу ещё раз, только если лимит будет превышен.</i>',
      ].join('\n'));
      expect(sent[0].keyboard).toEqual([[expect.objectContaining({ text: 'Открыть цели ↗', web_app: { url: AUDIT_URL } })]]);

      at('2026-10-27', '12:31');
      expect(await tick()).toEqual([]);
      await restart();
      await record('2026-10-28', 'Транспорт', 10_000, 'Такси');
      at('2026-10-28', '12:00');
      expect(await tick()).toEqual([]);
      expect(sent).toHaveLength(1);
    });

    it('over its limit: once more, by how much; the 80% message never comes after it', async () => {
      await auditedOnOctober14();
      await record('2026-10-27', 'Транспорт', 60_000, 'Такси');
      at('2026-10-27', '12:30');
      expect(await outcomes()).toEqual(['goal_near:sent']);

      await record('2026-10-29', 'Транспорт', 26_000, 'Такси домой');
      at('2026-10-29', '19:00');
      expect(await outcomes()).toEqual(['goal_over:sent']);
      expect(sent[1].text).toBe([
        `<b>Цель «Такси»: 110${NB}000 из 102${NB}000${NB}сум</b>`,
        `Лимит до конца октября превышен на 8${NB}000${NB}сум.`,
        '',
        '<i>Больше об этой цели в октябре не напишу.</i>',
      ].join('\n'));

      await restart();
      at('2026-10-30', '12:00');
      expect(await tick()).toEqual([]);
      expect(sent).toHaveLength(2);
    });

    it('straight over the limit: one message about the excess; back under it later, no 80% message', async () => {
      await auditedOnOctober14();
      const taxi = await record('2026-10-25', 'Транспорт', 90_000, 'Такси');
      at('2026-10-25', '12:00');
      expect(await outcomes()).toEqual(['goal_over:sent']);

      unwrap(await running.transactionModule.getDeleteTransactionUseCase().execute({ id: taxi, userId: owner }));
      await record('2026-10-26', 'Транспорт', 60_000, 'Такси');
      at('2026-10-26', '12:00');
      expect(await tick()).toEqual([]);
      expect(sent).toHaveLength(1);
    });

    it('in the daytime: a goal crossed at night is told in the morning', async () => {
      await auditedOnOctober14();
      await record('2026-10-27', 'Транспорт', 60_000, 'Такси');
      at('2026-10-27', '23:10');
      expect(await tick()).toEqual([]);
      at('2026-10-28', '09:59');
      expect(await tick()).toEqual([]);
      at('2026-10-28', '10:00');
      expect(await outcomes()).toEqual(['goal_near:sent']);
    });

    it('a goal whose month is over is not told; «Отказаться» and a subscription have no limit to tell', async () => {
      await auditedOnOctober14();
      await record('2026-10-31', 'Транспорт', 90_000, 'Такси');
      at('2026-11-01', '10:00');
      expect((await tick()).filter(result => result.kind.startsWith('goal'))).toEqual([]);
    });
  });

  describe('a subscription', () => {
    it('with «Напомнить»: the day before the charge at 10:00, the board\'s message, once', async () => {
      await auditedOnOctober14();
      expect((await remindAboutKinopoisk()).subscription).toMatchObject({ state: 'remind', remindOn: '2026-11-02', nextChargeOn: '2026-11-03' });
      const goal = (await goalNamed('Кинопоиск'))!;

      at('2026-11-02', '09:59');
      expect((await tick()).filter(result => result.kind === 'subscription')).toEqual([]);
      at('2026-11-02', '10:00');
      expect((await tick()).filter(result => result.kind === 'subscription')).toEqual([
        { userId: owner, kind: 'subscription', period: `${goal.id}:2026-11-02`, outcome: 'sent' },
      ]);
      const reminder = sent.find(message => message.text.includes('Кинопоиск'))!;
      expect(reminder.text).toBe([
        `<b>3${NB}ноября Кинопоиск спишет 50${NB}000${NB}сум</b>`,
        'В ревизии вы решили отменить подписку. Отменить можно только в самом сервисе.',
      ].join('\n'));
      expect(reminder.keyboard).toEqual([[
        expect.objectContaining({ text: 'Отменено', callback_data: `n:sub:ok:${goal.id}` }),
        expect.objectContaining({ text: 'Оставить', callback_data: `n:sub:keep:${goal.id}` }),
      ]]);

      await restart();
      at('2026-11-02', '18:00');
      expect((await tick()).filter(result => result.kind === 'subscription')).toEqual([]);
      at('2026-11-03', '10:00');
      expect((await tick()).filter(result => result.kind === 'subscription')).toEqual([]);
      expect(sent.filter(message => message.text.includes('Кинопоиск'))).toHaveLength(1);
    });

    it('without «Напомнить», or after «Уже отменено», the bot says nothing', async () => {
      await auditedOnOctober14();
      at('2026-11-02', '10:00');
      expect((await tick()).filter(result => result.kind === 'subscription')).toEqual([]);

      const goal = (await goalNamed('Кинопоиск'))!;
      await remindAboutKinopoisk();
      unwrap(await running.auditModule.getUpdateGoalUseCase().execute({ userId: owner, goalId: goal.id, body: { subscription: 'cancelled' }, today: '2026-10-20' }));
      at('2026-11-02', '11:00');
      expect((await tick()).filter(result => result.kind === 'subscription')).toEqual([]);
    });

    it('«Отменено»: the goal is answered as in the app, the message says it is done', async () => {
      await auditedOnOctober14();
      await remindAboutKinopoisk();
      at('2026-11-02', '10:00');
      await tick();
      const reminder = sent.find(message => message.text.includes('Кинопоиск'))!;

      at('2026-11-02', '10:05');
      const ctx = await press(reminder, 'Отменено');
      expect(ctx.answerCbQuery).toHaveBeenCalled();
      expect(edited(ctx)).toEqual({
        text: `<b>Кинопоиск: подписка отменена</b>\nМинус 50${NB}000${NB}сум в месяц. Цель из ревизии выполнена.`,
        keyboard: [],
      });
      expect(await goalNamed('Кинопоиск')).toMatchObject({ subscriptionState: 'cancelled', cancelledOn: '2026-11-02', remindOn: null });
    });

    it('«Оставить»: the goal is taken off, the spending counts as needed — the next audit leaves it out', async () => {
      await auditedOnOctober14();
      await remindAboutKinopoisk();
      at('2026-11-02', '10:00');
      await tick();
      const reminder = sent.find(message => message.text.includes('Кинопоиск'))!;
      expect((await audit('2026-11-02')).candidates.map(candidate => candidate.name)).toContain('Кинопоиск');

      at('2026-11-02', '10:05');
      const ctx = await press(reminder, 'Оставить');
      expect(edited(ctx)).toEqual({
        text: '<b>Кинопоиск остаётся</b>\nЦель «отменить» снята. Подписка снова попадёт в ревизию, только если подорожает.',
        keyboard: [],
      });
      expect(await goalNamed('Кинопоиск')).toBeUndefined();
      const september = (await new SqliteAuditRepository(running.ds).findByUserId(owner)).find(entry => entry.month === '2026-09')!;
      expect(september.items.find(item => item.name === 'Кинопоиск')).toMatchObject({ decision: 'need' });
      expect((await audit('2026-11-02')).candidates.map(candidate => candidate.name)).not.toContain('Кинопоиск');
    });

    it('a button under a goal that is gone: the buttons go, nothing is changed', async () => {
      await auditedOnOctober14();
      await remindAboutKinopoisk();
      at('2026-11-02', '10:00');
      await tick();
      const reminder = sent.find(message => message.text.includes('Кинопоиск'))!;
      await press(reminder, 'Оставить');

      const again = await press(reminder, 'Отменено');
      expect(again.editMessageText).not.toHaveBeenCalled();
      expect(again.editMessageReplyMarkup).toHaveBeenCalledWith({ inline_keyboard: [] });
      expect(again.answerCbQuery).toHaveBeenCalledWith('Этой цели уже нет');
    });
  });

  describe('the audit', () => {
    it('on the 1st at 10:00: «Ревизия октября готова», how many wait, «Открыть ревизию ↗» and «Позже» — once', async () => {
      await auditedOnOctober14();
      at('2026-11-01', '09:59');
      expect((await tick()).filter(result => result.kind === 'audit')).toEqual([]);

      at('2026-11-01', '10:00');
      expect((await tick()).filter(result => result.kind === 'audit')).toEqual([{ userId: owner, kind: 'audit', period: '2026-10', outcome: 'sent' }]);
      const left = (await audit('2026-11-01')).summary.left;
      expect(left).toBeGreaterThan(0);
      const call = sent.find(message => message.text.startsWith('<b>Ревизия'))!;
      expect(call.text).toBe(`<b>Ревизия октября готова</b>\n${spendings(left)} на проверку — пара минут.`);
      expect(call.keyboard).toEqual([
        [expect.objectContaining({ text: 'Открыть ревизию ↗', web_app: { url: AUDIT_URL } })],
        [expect.objectContaining({ text: 'Позже', callback_data: `n:later:2026-10:${left}` })],
      ]);

      at('2026-11-01', '10:01');
      expect((await tick()).filter(result => result.kind.startsWith('audit'))).toEqual([]);
      await restart();
      at('2026-11-01', '20:00');
      expect((await tick()).filter(result => result.kind.startsWith('audit'))).toEqual([]);
      at('2026-11-02', '10:00');
      expect((await tick()).filter(result => result.kind.startsWith('audit'))).toEqual([]);
      expect(sent.filter(message => message.text.startsWith('<b>Ревизия'))).toHaveLength(1);
    });

    it('at the chosen time; not at all when «Звать на ревизию» is off', async () => {
      await auditedOnOctober14();
      await save({ auditTime: '19:00' });
      at('2026-11-01', '18:59');
      expect((await tick()).filter(result => result.kind === 'audit')).toEqual([]);
      at('2026-11-01', '19:00');
      expect((await tick()).filter(result => result.kind === 'audit').map(result => result.outcome)).toEqual(['sent']);

      await save({ auditEnabled: false });
      at('2026-12-01', '19:00');
      expect((await tick()).filter(result => result.kind === 'audit')).toEqual([]);
      expect(sent.filter(message => message.text.startsWith('<b>Ревизия'))).toHaveLength(1);
    });

    it('nothing to call to: already done that morning, or before a whole month of records', async () => {
      await auditedOnOctober14();
      at('2026-11-01', '09:00');
      const opened = await audit('2026-11-01');
      await running.auditModule.getDecideAuditCandidateUseCase().execute({
        userId: owner, auditId: opened.id!, candidateId: opened.candidates[0].id, body: { decision: 'need' }, today: '2026-11-01',
      });
      unwrap(await running.auditModule.getFinishAuditUseCase().execute({ userId: owner, auditId: opened.id!, today: '2026-11-01' }));

      at('2026-11-01', '10:00');
      expect((await tick()).filter(result => result.kind === 'audit')).toEqual([{ userId: owner, kind: 'audit', period: '2026-10', outcome: 'skipped' }]);
      expect(sent.filter(message => message.text.startsWith('<b>Ревизия'))).toEqual([]);

      const newcomer = (await running.userModule.getGetOrCreateUserUseCase().execute({ telegramId: '597843120', firstName: 'New' })).id;
      await running.transactionModule.getCreateTransactionUseCase().execute({
        userId: newcomer, amountMinor: 2_500_000, category: 'Кафе', type: 'expense', description: 'Кофе', date: '2026-11-20', source: 'telegram',
      } as any);
      at('2026-12-01', '10:00');
      expect((await tick()).filter(result => result.userId === newcomer && result.kind === 'audit').map(result => result.outcome)).toEqual(['skipped']);
      expect(sent.filter(message => message.chatId === '597843120')).toEqual([]);
    });

    it('«Позже»: the call says when it comes again; it comes the next day at the same time, once, without «Позже»', async () => {
      await auditedOnOctober14();
      at('2026-11-01', '10:00');
      await tick();
      const call = sent.find(message => message.text.startsWith('<b>Ревизия'))!;
      const left = (await audit('2026-11-01')).summary.left;

      at('2026-11-01', '10:05');
      const ctx = await press(call, 'Позже');
      expect(edited(ctx)).toEqual({
        text: `<b>Ревизия октября готова</b>\n${spendings(left)} на проверку — пара минут.\n\n<i>Напомню 2${NB}ноября в 10:00, один раз.</i>`,
        keyboard: [[expect.objectContaining({ text: 'Открыть ревизию ↗', web_app: { url: AUDIT_URL } })]],
      });

      at('2026-11-01', '21:00');
      expect((await tick()).filter(result => result.kind.startsWith('audit'))).toEqual([]);
      await restart();
      at('2026-11-02', '09:59');
      expect((await tick()).filter(result => result.kind.startsWith('audit'))).toEqual([]);
      at('2026-11-02', '10:00');
      expect((await tick()).filter(result => result.kind.startsWith('audit'))).toEqual([
        { userId: owner, kind: 'audit_again', period: '2026-10', outcome: 'sent' },
      ]);
      const again = sent.filter(message => message.text.startsWith('<b>Ревизия')).slice(-1)[0];
      expect(again.text).toBe(`<b>Ревизия октября готова</b>\n${spendings(left)} на проверку — пара минут.\n\n<i>Больше не напомню — ревизия ждёт на главной.</i>`);
      expect(again.keyboard).toEqual([[expect.objectContaining({ text: 'Открыть ревизию ↗' })]]);

      // «Позже» once more on the first message: nothing new is promised or sent
      at('2026-11-02', '10:30');
      const second = await press(call, 'Позже');
      expect(edited(second).text).toContain(`Напомню 2${NB}ноября в 10:00, один раз.`);
      at('2026-11-03', '10:00');
      expect((await tick()).filter(result => result.kind.startsWith('audit'))).toEqual([]);
      expect(sent.filter(message => message.text.startsWith('<b>Ревизия'))).toHaveLength(2);
    });

    it('«Позже», then the audit done or «Звать на ревизию» off: no second call', async () => {
      await auditedOnOctober14();
      at('2026-11-01', '10:00');
      await tick();
      const call = sent.find(message => message.text.startsWith('<b>Ревизия'))!;
      at('2026-11-01', '10:05');
      await press(call, 'Позже');

      await save({ auditEnabled: false });
      at('2026-11-02', '10:00');
      expect((await tick()).filter(result => result.kind.startsWith('audit'))).toEqual([]);

      await save({ auditEnabled: true });
      const opened = await audit('2026-11-02');
      await running.auditModule.getDecideAuditCandidateUseCase().execute({
        userId: owner, auditId: opened.id!, candidateId: opened.candidates[0].id, body: { decision: 'need' }, today: '2026-11-02',
      });
      unwrap(await running.auditModule.getFinishAuditUseCase().execute({ userId: owner, auditId: opened.id!, today: '2026-11-02' }));
      at('2026-11-02', '11:00');
      expect((await tick()).filter(result => result.kind.startsWith('audit')).map(result => result.outcome)).toEqual(['skipped']);
      expect(sent.filter(message => message.text.startsWith('<b>Ревизия'))).toHaveLength(1);
    });

    it('«Позже» while «Звать на ревизию» is off promises nothing; under last month\'s audit it only drops the button', async () => {
      await auditedOnOctober14();
      at('2026-11-01', '10:00');
      await tick();
      const call = sent.find(message => message.text.startsWith('<b>Ревизия'))!;

      await save({ auditEnabled: false });
      at('2026-11-01', '10:05');
      const off = await press(call, 'Позже');
      expect(edited(off).text).not.toContain('Напомню');
      expect(edited(off).keyboard).toEqual([[expect.objectContaining({ text: 'Открыть ревизию ↗' })]]);

      at('2026-12-01', '08:00');
      const closed = await press(call, 'Позже');
      expect(closed.editMessageText).not.toHaveBeenCalled();
      expect(closed.editMessageReplyMarkup).toHaveBeenCalledWith({ inline_keyboard: [[expect.objectContaining({ text: 'Открыть ревизию ↗' })]] });
      expect(closed.answerCbQuery).toHaveBeenCalledWith('Эта ревизия уже закрыта');
    });
  });

  describe('«Цели и подписки» off', () => {
    it('no goal alert and no subscription reminder; switched on again, what is due that day comes', async () => {
      await auditedOnOctober14();
      await remindAboutKinopoisk();
      await save({ goalAlertsEnabled: false });
      await record('2026-10-27', 'Транспорт', 60_000, 'Такси');
      at('2026-10-27', '12:30');
      expect(await tick()).toEqual([]);
      at('2026-11-02', '10:00');
      expect((await tick()).filter(result => result.kind === 'subscription')).toEqual([]);

      await save({ goalAlertsEnabled: true });
      at('2026-11-02', '10:01');
      expect((await tick()).filter(result => result.kind === 'subscription').map(result => result.outcome)).toEqual(['sent']);
    });
  });

  it('Telegram refuses (the bot is blocked): kept as failed, not tried again', async () => {
    await auditedOnOctober14();
    await record('2026-10-27', 'Транспорт', 60_000, 'Такси');
    refuse = new Error('403: Forbidden: bot was blocked by the user');
    at('2026-10-27', '12:30');
    expect(await outcomes()).toEqual(['goal_near:failed']);

    refuse = null;
    at('2026-10-27', '12:31');
    expect(await tick()).toEqual([]);
    expect(sent).toEqual([]);
  });

  /** What Telegraf's fetch throws when the request did not get through. */
  const networkError = (code: string) =>
    Object.assign(new Error(`request to https://api.telegram.org/bot123:[REDACTED]/sendMessage failed, reason: ${code}`), {
      name: 'FetchError', type: 'system', code, errno: code,
    });

  it('no network (the Mac woke without it): tried again the next minute; a reset connection is not (FT-144)', async () => {
    await auditedOnOctober14();
    await record('2026-10-27', 'Транспорт', 60_000, 'Такси');
    refuse = networkError('ENOTFOUND');
    at('2026-10-27', '12:30');
    expect(await outcomes()).toEqual(['goal_near:retry']);

    refuse = null;
    at('2026-10-27', '12:31');
    expect(await outcomes()).toEqual(['goal_near:sent']);
    at('2026-10-27', '12:32');
    expect(await tick()).toEqual([]);
    expect(sent).toHaveLength(1);

    await record('2026-10-28', 'Транспорт', 60_000, 'Такси');
    refuse = networkError('ECONNRESET');
    at('2026-10-28', '12:30');
    expect(await outcomes()).toEqual(['goal_over:failed']);
    refuse = null;
    at('2026-10-28', '12:31');
    expect(await tick()).toEqual([]);
    expect(sent).toHaveLength(1);
  });

  it('straight over the limit with no network: the excess is told once it is back, never the 80% (FT-144)', async () => {
    await auditedOnOctober14();
    await record('2026-10-25', 'Транспорт', 90_000, 'Такси');
    refuse = networkError('EAI_AGAIN');
    at('2026-10-25', '12:00');
    expect(await outcomes()).toEqual(['goal_over:retry']);

    refuse = null;
    at('2026-10-25', '12:01');
    expect(await outcomes()).toEqual(['goal_over:sent']);
    at('2026-10-25', '12:02');
    expect(await tick()).toEqual([]);
    expect(sent).toHaveLength(1);
  });

  it('no network all day: tried until the day ends, then kept as failed (FT-144)', async () => {
    await auditedOnOctober14();
    await record('2026-10-27', 'Транспорт', 60_000, 'Такси');
    refuse = networkError('ENOTFOUND');
    at('2026-10-27', '12:30');
    expect(await outcomes()).toEqual(['goal_near:retry']);
    at('2026-10-27', '18:00');
    expect(await outcomes()).toEqual(['goal_near:retry']);

    at('2026-10-28', '12:30');
    expect(await outcomes()).toEqual(['goal_near:failed']);
    refuse = null;
    at('2026-10-28', '12:31');
    expect(await tick()).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('two bot processes over the same file at the same minute: one message', async () => {
    await auditedOnOctober14();
    await record('2026-10-27', 'Транспорт', 60_000, 'Такси');
    const second = await start();
    at('2026-10-27', '12:30');

    await Promise.all([tick(), second.notificationModule.getReminders()!.tick(reminderSender(telegram as any))]);

    expect(sent).toHaveLength(1);
  });
});
