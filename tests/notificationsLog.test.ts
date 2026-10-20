import 'reflect-metadata';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DataSource } from 'typeorm';
import { createAppDataSource } from '../src/shared/infrastructure/database/database.config';
import { findSchemaDrift, runMigrationsWithBackup } from '../src/shared/infrastructure/database/migrationRunner';
import { SqliteNotificationLogRepository } from '../src/modules/notification/infrastructure/SqliteNotificationLogRepository';

/**
 * FT-124: what the bot already sent and for which period lives in `notifications_log`, so a notice goes out
 * at most once — a second tick, a restart, a second process over the same file. Real SQLite file.
 */
describe('notifications log (FT-124)', () => {
  let dir: string;
  let file: string;
  const open: DataSource[] = [];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft124-log-'));
    file = path.join(dir, 'db.sqlite');
  });

  afterEach(async () => {
    for (const ds of open.splice(0)) if (ds.isInitialized) await ds.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function connect(): Promise<{ ds: DataSource; log: SqliteNotificationLogRepository }> {
    const ds = createAppDataSource(file);
    open.push(ds);
    await ds.initialize();
    await runMigrationsWithBackup(ds, file, path.join(dir, 'backups'));
    return { ds, log: new SqliteNotificationLogRepository(ds) };
  }

  it('creates the table with the migration, matching the entity', async () => {
    const { ds } = await connect();

    expect(await ds.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'notifications_log'`)).toEqual([{ name: 'notifications_log' }]);
    expect(await findSchemaDrift(ds)).toEqual([]);
  });

  it('is removed by reverting its migration; the records stay', async () => {
    const { ds } = await connect();
    // Later tasks add migrations after this one: revert down to it
    for (;;) {
      const [last] = await ds.query(`SELECT "name" FROM "migrations" ORDER BY "id" DESC LIMIT 1`);
      await ds.undoLastMigration({ transaction: 'each' });
      if (!last || last.name === 'NotificationsLog1762000000000') break;
    }

    expect(await ds.query(`SELECT name FROM sqlite_master WHERE name = 'notifications_log'`)).toEqual([]);
    expect(await ds.query(`SELECT name FROM sqlite_master WHERE name = 'transactions'`)).toEqual([{ name: 'transactions' }]);
  });

  it('claims a period once: the second claim, after a restart too, gets nothing', async () => {
    const first = await connect();
    expect(await first.log.claim({ id: 'n-1', userId: 'user-1', kind: 'daily_summary', period: '2026-10-14' })).toBe(true);
    expect(await first.log.claim({ id: 'n-2', userId: 'user-1', kind: 'daily_summary', period: '2026-10-14' })).toBe(false);
    await first.ds.destroy();

    const second = await connect();
    expect(await second.log.claim({ id: 'n-3', userId: 'user-1', kind: 'daily_summary', period: '2026-10-14' })).toBe(false);
    // Another day, another user: their own periods
    expect(await second.log.claim({ id: 'n-4', userId: 'user-1', kind: 'daily_summary', period: '2026-10-15' })).toBe(true);
    expect(await second.log.claim({ id: 'n-5', userId: 'user-2', kind: 'daily_summary', period: '2026-10-14' })).toBe(true);

    const entry = await second.log.find('user-1', 'daily_summary', '2026-10-14');
    expect(entry).toMatchObject({ id: 'n-1', userId: 'user-1', kind: 'daily_summary', period: '2026-10-14', status: 'sending' });
  });

  it('two connections claiming the same period at once: exactly one wins', async () => {
    const a = await connect();
    const b = await connect();

    const results = await Promise.all([
      a.log.claim({ id: 'a', userId: 'user-1', kind: 'daily_summary', period: '2026-10-14' }),
      b.log.claim({ id: 'b', userId: 'user-1', kind: 'daily_summary', period: '2026-10-14' }),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('keeps what was sent, to which message, and the answer to it', async () => {
    const { log } = await connect();
    await log.claim({ id: 'n-1', userId: 'user-1', kind: 'daily_summary', period: '2026-10-19' });

    await log.update('n-1', { status: 'sent', variant: 'empty', chatId: '597843119', messageId: 812 });
    await log.update('n-1', { answer: 'no_spending' });

    expect(await log.find('user-1', 'daily_summary', '2026-10-19')).toMatchObject({
      status: 'sent', variant: 'empty', chatId: '597843119', messageId: 812, answer: 'no_spending', error: null,
    });
  });

  it('lists the sent notices of a variant, newest period first, skipped and failed ones left out', async () => {
    const { log } = await connect();
    const write = async (id: string, period: string, status: 'sent' | 'skipped' | 'failed', variant: 'empty' | 'summary') => {
      await log.claim({ id, userId: 'user-1', kind: 'daily_summary', period });
      await log.update(id, { status, variant });
    };
    await write('a', '2026-10-15', 'sent', 'empty');
    await write('b', '2026-10-16', 'sent', 'summary');
    await write('c', '2026-10-17', 'sent', 'empty');
    await write('d', '2026-10-18', 'skipped', 'empty');
    await write('e', '2026-10-19', 'failed', 'empty');
    await log.claim({ id: 'f', userId: 'user-2', kind: 'daily_summary', period: '2026-10-19' });
    await log.update('f', { status: 'sent', variant: 'empty' });

    const asked = await log.lastSent('user-1', 'daily_summary', 'empty', 2);

    expect(asked.map(entry => entry.period)).toEqual(['2026-10-17', '2026-10-15']);
  });
});
