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
    expect(await first.log.claim({ id: 'n-1', userId: 'user-1', kind: 'daily_summary', period: '2026-10-14', sendUntil: '2026-10-14' })).toBe(true);
    expect(await first.log.claim({ id: 'n-2', userId: 'user-1', kind: 'daily_summary', period: '2026-10-14', sendUntil: '2026-10-14' })).toBe(false);
    await first.ds.destroy();

    const second = await connect();
    expect(await second.log.claim({ id: 'n-3', userId: 'user-1', kind: 'daily_summary', period: '2026-10-14', sendUntil: '2026-10-14' })).toBe(false);
    // Another day, another user: their own periods
    expect(await second.log.claim({ id: 'n-4', userId: 'user-1', kind: 'daily_summary', period: '2026-10-15', sendUntil: '2026-10-15' })).toBe(true);
    expect(await second.log.claim({ id: 'n-5', userId: 'user-2', kind: 'daily_summary', period: '2026-10-14', sendUntil: '2026-10-14' })).toBe(true);

    const entry = await second.log.find('user-1', 'daily_summary', '2026-10-14');
    expect(entry).toMatchObject({ id: 'n-1', userId: 'user-1', kind: 'daily_summary', period: '2026-10-14', status: 'sending' });
  });

  it('two connections claiming the same period at once: exactly one wins', async () => {
    const a = await connect();
    const b = await connect();

    const results = await Promise.all([
      a.log.claim({ id: 'a', userId: 'user-1', kind: 'daily_summary', period: '2026-10-14', sendUntil: '2026-10-14' }),
      b.log.claim({ id: 'b', userId: 'user-1', kind: 'daily_summary', period: '2026-10-14', sendUntil: '2026-10-14' }),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('keeps what was sent, to which message, and the answer to it', async () => {
    const { log } = await connect();
    await log.claim({ id: 'n-1', userId: 'user-1', kind: 'daily_summary', period: '2026-10-19', sendUntil: '2026-10-19' });

    await log.update('n-1', { status: 'sent', variant: 'empty', chatId: '597843119', messageId: 812 });
    await log.update('n-1', { answer: 'no_spending' });

    expect(await log.find('user-1', 'daily_summary', '2026-10-19')).toMatchObject({
      status: 'sent', variant: 'empty', chatId: '597843119', messageId: 812, answer: 'no_spending', error: null,
    });
  });

  it('keeps «Позже» under the audit call and the day the call comes again (FT-133)', async () => {
    const { log } = await connect();
    await log.claim({ id: 'n-1', userId: 'user-1', kind: 'audit', period: '2026-10', sendUntil: '2026-11-01' });
    await log.update('n-1', { status: 'sent', chatId: '597843119', messageId: 900 });

    expect(await log.find('user-1', 'audit', '2026-10')).toMatchObject({ answer: null, dueOn: null });
    await log.update('n-1', { answer: 'later', dueOn: '2026-11-02' });

    expect(await log.find('user-1', 'audit', '2026-10')).toMatchObject({ status: 'sent', answer: 'later', dueOn: '2026-11-02' });
    // The second call is a notice of its own: once per audit
    expect(await log.claim({ id: 'n-2', userId: 'user-1', kind: 'audit_again', period: '2026-10', sendUntil: '2026-11-01' })).toBe(true);
    expect(await log.claim({ id: 'n-3', userId: 'user-1', kind: 'audit_again', period: '2026-10', sendUntil: '2026-11-01' })).toBe(false);
  });

  it('lists the sent notices of a variant, newest period first, skipped and failed ones left out', async () => {
    const { log } = await connect();
    const write = async (id: string, period: string, status: 'sent' | 'skipped' | 'failed', variant: 'empty' | 'summary') => {
      await log.claim({ id, userId: 'user-1', kind: 'daily_summary', period, sendUntil: period });
      await log.update(id, { status, variant });
    };
    await write('a', '2026-10-15', 'sent', 'empty');
    await write('b', '2026-10-16', 'sent', 'summary');
    await write('c', '2026-10-17', 'sent', 'empty');
    await write('d', '2026-10-18', 'skipped', 'empty');
    await write('e', '2026-10-19', 'failed', 'empty');
    await log.claim({ id: 'f', userId: 'user-2', kind: 'daily_summary', period: '2026-10-19', sendUntil: '2026-10-19' });
    await log.update('f', { status: 'sent', variant: 'empty' });

    const asked = await log.lastSent('user-1', ['daily_summary'], 'empty', 2);

    expect(asked.map(entry => entry.period)).toEqual(['2026-10-17', '2026-10-15']);

    // A question caught up the next morning counts with the evening ones when asked for both kinds (FT-164)
    await log.claim({ id: 'g', userId: 'user-1', kind: 'daily_summary_late', period: '2026-10-18', sendUntil: '2026-10-19' });
    await log.update('g', { status: 'sent', variant: 'empty' });
    expect((await log.lastSent('user-1', ['daily_summary', 'daily_summary_late'], 'empty', 2)).map(entry => entry.period)).toEqual(['2026-10-18', '2026-10-17']);
  });

  describe('a notice that did not leave (FT-164)', () => {
    it('is claimed with its first attempt and the last day it may still go out; a waiting one with none', async () => {
      const { log } = await connect();

      expect(await log.claim({ id: 'n-1', userId: 'user-1', kind: 'goal_near', period: 'goal-1', sendUntil: '2026-10-28' })).toBe(true);
      expect(await log.claim({ id: 'n-2', userId: 'user-1', kind: 'daily_summary_late', period: '2026-10-26', sendUntil: '2026-10-27', waiting: true })).toBe(true);

      expect(await log.find('user-1', 'goal_near', 'goal-1')).toMatchObject({ status: 'sending', attempts: 1, sendUntil: '2026-10-28' });
      expect(await log.find('user-1', 'daily_summary_late', '2026-10-26')).toMatchObject({ status: 'not_sent', attempts: 0, sendUntil: '2026-10-27', error: null });
    });

    it('waits as not_sent with its attempts across a restart; of two ticks taking it again at once, one wins', async () => {
      const first = await connect();
      await first.log.claim({ id: 'n-1', userId: 'user-1', kind: 'daily_summary', period: '2026-10-26', sendUntil: '2026-10-26' });
      expect(await first.log.transition('n-1', 'sending', { status: 'not_sent', error: 'getaddrinfo ENOTFOUND api.telegram.org' })).toBe(true);
      await first.ds.destroy();

      const a = await connect();
      const b = await connect();
      expect(await a.log.find('user-1', 'daily_summary', '2026-10-26')).toMatchObject({ status: 'not_sent', attempts: 1, error: 'getaddrinfo ENOTFOUND api.telegram.org' });

      const taken = await Promise.all([
        a.log.transition('n-1', 'not_sent', { status: 'sending', attempts: 2 }),
        b.log.transition('n-1', 'not_sent', { status: 'sending', attempts: 2 }),
      ]);

      expect(taken.filter(Boolean)).toHaveLength(1);
      expect(await a.log.find('user-1', 'daily_summary', '2026-10-26')).toMatchObject({ status: 'sending', attempts: 2 });
      // A row being sent is never taken again: at most once
      expect(await a.log.transition('n-1', 'not_sent', { status: 'sending', attempts: 3 })).toBe(false);
    });

    it('lists the user\'s notices of the asked kinds still not_sent after their last day', async () => {
      const { log } = await connect();
      const write = async (id: string, kind: 'daily_summary' | 'daily_summary_late' | 'subscription', period: string, sendUntil: string, status: 'not_sent' | 'failed', userId = 'user-1') => {
        await log.claim({ id, userId, kind, period, sendUntil });
        await log.update(id, { status });
      };
      await write('a', 'daily_summary', '2026-10-25', '2026-10-25', 'not_sent');
      await write('b', 'daily_summary_late', '2026-10-25', '2026-10-26', 'not_sent');
      await write('c', 'daily_summary', '2026-10-24', '2026-10-24', 'failed');
      await write('d', 'subscription', 'goal-1:2026-10-25', '2026-10-25', 'not_sent');
      await write('e', 'daily_summary', '2026-10-25', '2026-10-25', 'not_sent', 'user-2');

      const expired = await log.expired('user-1', ['daily_summary', 'daily_summary_late'], '2026-10-26');

      expect(expired.map(entry => entry.id)).toEqual(['a']);
      expect((await log.expired('user-1', ['daily_summary', 'daily_summary_late'], '2026-10-27')).map(entry => entry.id).sort()).toEqual(['a', 'b']);
    });

    it('says whether the user has a notice of the kind for an earlier period', async () => {
      const { log } = await connect();
      await log.claim({ id: 'a', userId: 'user-1', kind: 'daily_summary', period: '2026-10-24', sendUntil: '2026-10-24' });

      expect(await log.hasEarlier('user-1', 'daily_summary', '2026-10-25')).toBe(true);
      expect(await log.hasEarlier('user-1', 'daily_summary', '2026-10-24')).toBe(false);
      expect(await log.hasEarlier('user-2', 'daily_summary', '2026-10-25')).toBe(false);
      expect(await log.hasEarlier('user-1', 'daily_summary_late', '2026-10-25')).toBe(false);
    });

    it('reverting its migration keeps the rows; one still not_sent becomes failed, as the older code would leave it', async () => {
      const { ds, log } = await connect();
      await log.claim({ id: 'a', userId: 'user-1', kind: 'daily_summary', period: '2026-10-26', sendUntil: '2026-10-26' });
      await log.transition('a', 'sending', { status: 'not_sent', error: 'getaddrinfo ENOTFOUND api.telegram.org' });
      await log.claim({ id: 'b', userId: 'user-1', kind: 'daily_summary', period: '2026-10-25', sendUntil: '2026-10-25' });
      await log.update('b', { status: 'sent', variant: 'summary' });
      for (;;) {
        const [last] = await ds.query(`SELECT "name" FROM "migrations" ORDER BY "id" DESC LIMIT 1`);
        await ds.undoLastMigration({ transaction: 'each' });
        if (!last || last.name === 'NotificationAttempts1762500000000') break;
      }

      const columns = (await ds.query(`PRAGMA table_info("notifications_log")`)).map((column: { name: string }) => column.name);
      expect(columns).not.toContain('attempts');
      expect(columns).not.toContain('send_until');
      expect(await ds.query(`SELECT id, status, error FROM notifications_log ORDER BY id`)).toEqual([
        { id: 'a', status: 'failed', error: 'getaddrinfo ENOTFOUND api.telegram.org' },
        { id: 'b', status: 'sent', error: null },
      ]);
    });
  });
});
