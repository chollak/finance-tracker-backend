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

  it('is removed by reverting its migration', async () => {
    const { ds } = await startBot();

    await ds.undoLastMigration({ transaction: 'each' });

    expect(await ds.query(`SELECT name FROM sqlite_master WHERE name = 'bot_messages'`)).toEqual([]);
  });
});
