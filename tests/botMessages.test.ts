import 'reflect-metadata';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DataSource } from 'typeorm';
import { createAppDataSource } from '../src/shared/infrastructure/database/database.config';
import { findSchemaDrift, runMigrationsWithBackup } from '../src/shared/infrastructure/database/migrationRunner';
import { BotMessageModule } from '../src/modules/botMessage/botMessageModule';
import { SqliteBotMessageRepository } from '../src/modules/botMessage/infrastructure/SqliteBotMessageRepository';

/**
 * FT-122: the link «bot message → its records» lives in `bot_messages`, so «Изменить», «Вернуть» and
 * /undo keep working after the bot restarts. Runs on a real SQLite file that is closed and opened again.
 */
describe('bot messages (FT-122)', () => {
  let dir: string;
  let file: string;
  const open: DataSource[] = [];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft122-'));
    file = path.join(dir, 'db.sqlite');
  });

  afterEach(async () => {
    for (const ds of open.splice(0)) if (ds.isInitialized) await ds.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** The bot's process starting: a new connection to the same file and a new module over it. */
  async function startBot(): Promise<{ ds: DataSource; module: BotMessageModule }> {
    const ds = createAppDataSource(file);
    open.push(ds);
    await ds.initialize();
    await runMigrationsWithBackup(ds, file, path.join(dir, 'backups'));
    return { ds, module: new BotMessageModule(new SqliteBotMessageRepository(ds)) };
  }

  async function stopBot(ds: DataSource): Promise<void> {
    await ds.destroy();
  }

  it('creates the table with the migration, matching the entity', async () => {
    const { ds } = await startBot();

    expect(await ds.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'bot_messages'`)).toEqual([{ name: 'bot_messages' }]);
    expect(await findSchemaDrift(ds)).toEqual([]);
  });

  it('remembers which records a message shows, and finds them again after a restart', async () => {
    const first = await startBot();
    await first.module.getLog().remember({
      userId: 'user-1',
      chatId: '131184740',
      messageId: 501,
      recordIds: ['tx-1', 'tx-2'],
      guessed: ['tx-2'],
      heard: 'Супермаркет сто восемьдесят шесть тысяч четыреста, картой',
    });
    await stopBot(first.ds);

    const second = await startBot();
    const found = await second.module.getLog().find('131184740', 501);

    expect(found).toEqual(expect.objectContaining({
      userId: 'user-1',
      chatId: '131184740',
      messageId: 501,
      recordIds: ['tx-1', 'tx-2'],
      mode: 'confirm',
      heard: 'Супермаркет сто восемьдесят шесть тысяч четыреста, картой',
    }));
    expect(found!.state).toEqual({ selected: 0, guessed: ['tx-2'] });
    expect(await second.module.getLog().find('131184740', 502)).toBeNull();
    expect(await second.module.getLog().find('999', 501)).toBeNull();
  });

  it('keeps the open keyboard screen and the last change across a restart', async () => {
    const first = await startBot();
    const log = first.module.getLog();
    const message = await log.remember({ userId: 'user-1', chatId: '1', messageId: 10, recordIds: ['tx-1'] });
    await log.save(message, { mode: 'category', state: { ...message.state, pickType: 'income', changed: 'Сумма изменена: было 25 000' } });
    await stopBot(first.ds);

    const second = await startBot();
    const found = await second.module.getLog().find('1', 10);

    expect(found!.mode).toBe('category');
    expect(found!.state).toEqual({ selected: 0, guessed: [], pickType: 'income', changed: 'Сумма изменена: было 25 000' });
  });

  it('lists a chat’s messages newest first, without other chats', async () => {
    const { module } = await startBot();
    const log = module.getLog();
    for (const [chatId, messageId] of [['1', 10], ['1', 12], ['2', 13], ['1', 11]] as const) {
      await log.remember({ userId: 'user-1', chatId, messageId, recordIds: [`tx-${messageId}`] });
    }

    expect((await log.recent('1')).map(message => message.messageId)).toEqual([12, 11, 10]);
  });

  it('finds the message of a chat that waits for an amount', async () => {
    const { module } = await startBot();
    const log = module.getLog();
    const waiting = await log.remember({ userId: 'user-1', chatId: '1', messageId: 10, recordIds: ['tx-1'] });
    await log.remember({ userId: 'user-1', chatId: '1', messageId: 11, recordIds: ['tx-2'] });
    const elsewhere = await log.remember({ userId: 'user-2', chatId: '2', messageId: 12, recordIds: ['tx-3'] });

    expect(await log.awaitingAmount('1')).toBeNull();

    await log.save(waiting, { mode: 'amount' });
    await log.save(elsewhere, { mode: 'amount' });

    expect((await log.awaitingAmount('1'))?.messageId).toBe(10);
  });

  it('keeps what a clarification asked across a restart (FT-123)', async () => {
    const first = await startBot();
    const log = first.module.getLog();
    const message = await log.remember({
      userId: 'user-1',
      chatId: '1',
      messageId: 10,
      recordIds: ['tx-1', 'tx-2'],
      state: {
        assumed: { 'tx-2': { written: '45', amountMinor: 4_500_000 } },
        missing: [{ description: 'такси', category: 'Транспорт', type: 'expense', date: '2026-10-16' }],
      },
    });
    await log.save(message, {
      mode: 'large',
      state: {
        ...message.state,
        notes: ['«Такси» — без суммы, не записал.'],
        large: { index: 1, replyClosed: true },
        declined: ['tx-3'],
        back: 'confirm',
      },
    });
    await stopBot(first.ds);

    const second = await startBot();
    const found = await second.module.getLog().find('1', 10);

    expect(found!.mode).toBe('large');
    expect(found!.state).toEqual({
      selected: 0,
      guessed: [],
      assumed: { 'tx-2': { written: '45', amountMinor: 4_500_000 } },
      missing: [{ description: 'такси', category: 'Транспорт', type: 'expense', date: '2026-10-16' }],
      notes: ['«Такси» — без суммы, не записал.'],
      large: { index: 1, replyClosed: true },
      declined: ['tx-3'],
      back: 'confirm',
    });
  });

  it('waits for an amount while a message asks «Сколько?» or about a large amount, one question a chat (FT-123)', async () => {
    const { module } = await startBot();
    const log = module.getLog();
    const asking = await log.remember({
      userId: 'user-1',
      chatId: '1',
      messageId: 10,
      recordIds: ['tx-1'],
      state: { missing: [{ description: 'такси', category: 'Транспорт', type: 'expense' }] },
    });
    expect((await log.awaitingAmount('1'))?.messageId).toBe(10);

    const answered = await log.save(asking, { state: { ...asking.state, missing: [], notes: ['«Такси» — пропустил.'] } });
    expect(await log.awaitingAmount('1')).toBeNull();

    const large = await log.remember({ userId: 'user-1', chatId: '1', messageId: 11, recordIds: ['tx-2'], mode: 'large', state: { large: { index: 0 } } });
    expect((await log.awaitingAmount('1'))?.messageId).toBe(11);
    expect(await log.otherQuestions(answered)).toEqual([expect.objectContaining({ messageId: 11 })]);

    // «Если сумма другая — напишите её» withdrawn: the buttons stay, the next text is not an answer
    await log.save(large, { state: { ...large.state, large: { index: 0, replyClosed: true } } });
    expect(await log.awaitingAmount('1')).toBeNull();
  });

  it('a message waiting for an amount before FT-123 still waits after the update', async () => {
    const { ds } = await startBot();
    await ds.undoLastMigration({ transaction: 'each' }); // back to FT-122's table
    await ds.query(`INSERT INTO "bot_messages" ("id", "user_id", "chat_id", "message_id", "record_ids", "mode", "state") VALUES ('m-1', 'user-1', '1', 10, '["tx-1"]', 'amount', '{"selected":0,"guessed":[]}')`);
    await ds.runMigrations({ transaction: 'each' });

    const log = new BotMessageModule(new SqliteBotMessageRepository(ds)).getLog();
    expect((await log.awaitingAmount('1'))?.messageId).toBe(10);
    expect(await findSchemaDrift(ds)).toEqual([]);
  });

  it('is removed by reverting its migration', async () => {
    const { ds } = await startBot();

    await ds.undoLastMigration({ transaction: 'each' }); // FT-123: the open question
    expect((await ds.query(`PRAGMA table_info("bot_messages")`)).map((column: { name: string }) => column.name)).not.toContain('question');
    await ds.undoLastMigration({ transaction: 'each' });

    expect(await ds.query(`SELECT name FROM sqlite_master WHERE name = 'bot_messages'`)).toEqual([]);
  });
});
