import 'reflect-metadata';
import type { Update } from 'telegraf/types';
import { chatQueue, SLOW_UPDATE_MS } from '../src/delivery/messaging/telegram/middleware/chatQueue';
import { BotContext } from '../src/delivery/messaging/telegram/types';
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
import { captureLogLines, LogCapture } from './helpers/logLines';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { TelegramStand } from './helpers/telegramStand';

/**
 * #317: Telegraf's polling hands a whole batch of getUpdates to the handlers side by side, and a batch is everything
 * that came while the bot did not poll. The bot takes the updates of one chat one at a time, in Telegram's order; other
 * chats do not wait for it, and no update is cut by Telegraf's 90 s while it is still being handled.
 */

function deferred<T = void>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

/** An update of `chatId` as the queue sees it; no chat for a payment's pre_checkout_query. */
function contextOf(chatId: number | undefined, updateId: number): BotContext {
  return {
    chat: chatId === undefined ? undefined : { id: chatId, type: 'private' },
    update: { update_id: updateId },
    updateType: chatId === undefined ? 'pre_checkout_query' : 'message',
  } as unknown as BotContext;
}

describe('one update of a chat at a time (#317)', () => {
  it('starts an update only once the one before it in the chat is done, in the order they came', async () => {
    const queue = chatQueue();
    const started: number[] = [];
    const first = deferred();

    const one = queue(contextOf(1, 10), async () => { started.push(10); await first.promise; });
    const two = queue(contextOf(1, 11), async () => { started.push(11); });
    const three = queue(contextOf(1, 12), async () => { started.push(12); });
    await flush();
    expect(started).toEqual([10]);

    first.resolve();
    await Promise.all([one, two, three]);
    expect(started).toEqual([10, 11, 12]);
  });

  it('does not hold another chat', async () => {
    const queue = chatQueue();
    const slow = deferred();
    const started: number[] = [];

    const first = queue(contextOf(1, 10), async () => { started.push(10); await slow.promise; });
    await queue(contextOf(2, 11), async () => { started.push(11); });

    expect(started).toEqual([10, 11]);
    slow.resolve();
    await first;
  });

  it('a failed update fails only itself: its error goes to its own bot.catch, the chat’s next update still runs', async () => {
    const queue = chatQueue();
    const failure = new Error('Telegram refused');
    const started: number[] = [];

    const failed = queue(contextOf(1, 10), async () => { started.push(10); throw failure; });
    const next = queue(contextOf(1, 11), async () => { started.push(11); });

    await expect(failed).rejects.toBe(failure);
    await expect(next).resolves.toBeUndefined();
    expect(started).toEqual([10, 11]);
  });

  it('does not hold an update without a chat: a payment check is answered at once', async () => {
    const queue = chatQueue();
    const slow = deferred();
    const answered = jest.fn();

    const first = queue(contextOf(1, 10), () => slow.promise);
    await queue(contextOf(undefined, 11), async () => { answered(); });

    expect(answered).toHaveBeenCalled();
    slow.resolve();
    await first;
  });

  describe('an update that takes long', () => {
    let log: LogCapture;

    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'queueMicrotask', 'hrtime', 'performance', 'Date'] });
      log = captureLogLines();
    });

    afterEach(() => {
      log.restore();
      jest.useRealTimers();
    });

    it('is logged once after SLOW_UPDATE_MS and runs to its end; no timer is left to hold the process', async () => {
      const queue = chatQueue();
      const slow = deferred();
      const handled = jest.fn();

      const update = queue(contextOf(1, 10), async () => { await slow.promise; handled(); });
      await flush();
      jest.advanceTimersByTime(SLOW_UPDATE_MS - 1);
      expect((await log.lines()).filter(line => line.includes('still being handled'))).toEqual([]);

      jest.advanceTimersByTime(1);
      const warned = (await log.lines()).filter(line => line.includes('still being handled'));
      expect(warned).toEqual([expect.stringContaining('warn')]);
      expect(warned[0]).toContain('"updateId":10');

      slow.resolve();
      await update;
      expect(handled).toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});

describe('the bot on the real Telegraf: one batch of getUpdates (#317)', () => {
  const TELEGRAM_ID = 131184740;
  const OTHER_ID = 222000111;
  let db: TestDatabase;
  let stand: TelegramStand;
  const capture = jest.fn();

  /** /help from someone else's chat, as Telegram delivers it. */
  function helpFromAnotherChat(): Update.MessageUpdate {
    const person = { id: OTHER_ID, is_bot: false, first_name: 'Other' };
    return {
      update_id: 9_000,
      message: {
        message_id: 9_000,
        date: Math.floor(Date.now() / 1000),
        chat: { id: OTHER_ID, type: 'private', first_name: 'Other' },
        from: person,
        text: '/help',
        entities: [{ type: 'bot_command', offset: 0, length: 5 }],
      },
    } as Update.MessageUpdate;
  }

  const sentTo = (chatId: number) => stand.calls
    .filter(call => call.method === 'sendMessage' && call.payload.chat_id === chatId)
    .map(call => String(call.payload.text));

  /** Lets the bot run — the database included — until `condition` holds. */
  async function until(condition: () => boolean): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (!condition() && Date.now() < deadline) await flush();
    if (!condition()) throw new Error('The bot did not get there in 5 s');
  }

  beforeEach(async () => {
    db = await openMigratedDatabase();
    const ds = db.dataSource;
    const categoryModule = new CategoryModule(new SqliteCategoryRepository(ds));
    const accountModule = new AccountModule(new SqliteAccountRepository(ds), undefined, new SqliteAccountMoveRepository(ds));
    const transactionModule = new TransactionModule(new SqliteTransactionRepository(ds));
    transactionModule.setCategoryResolver(categoryModule.getCatalog());
    transactionModule.setAccountResolver(accountModule.getBook());
    const userModule = new UserModule(new SqliteUserRepository(ds), new SqliteUserSettingsRepository(ds));

    capture.mockReset().mockResolvedValue({ transactions: [], debts: [] });
    stand = new TelegramStand({ id: TELEGRAM_ID, first_name: 'Shukur' });
    stand.install();
    stand.start({ transactionModule, userModule, quickCaptureModule: { getQuickCaptureService: () => ({ capture }) } });
  });

  afterEach(async () => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    await db.close();
  });

  it('a phrase parsed longer than Telegraf’s 90 s gets no «Произошла ошибка»; the chat’s next update waits for it, another chat does not', async () => {
    // Only the timers are fake: Telegraf's handler limit and the queue's warning; the database runs as it does
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'queueMicrotask', 'hrtime', 'performance', 'Date'] });
    const parsed = deferred<{ transactions: never[]; debts: never[] }>();
    capture.mockImplementationOnce(() => parsed.promise);

    const batch = stand.deliver([stand.textUpdate('такси 18к'), stand.textUpdate('/help'), helpFromAnotherChat()]);
    await until(() => capture.mock.calls.length === 1 && sentTo(OTHER_ID).length === 1);

    expect(sentTo(OTHER_ID)).toEqual([expect.stringContaining('/undo — отменить последнюю запись')]);
    expect(sentTo(TELEGRAM_ID)).toEqual([]);

    jest.advanceTimersByTime(91_000);
    await flush();
    expect(stand.caught).toEqual([]);
    expect(sentTo(TELEGRAM_ID)).toEqual([]);

    parsed.resolve({ transactions: [], debts: [] });
    await batch;

    expect(sentTo(TELEGRAM_ID)).toEqual([
      expect.stringContaining('Не нашёл, что записать'),
      expect.stringContaining('/undo — отменить последнюю запись'),
    ]);
    expect(stand.caught).toEqual([]);
  });
});
