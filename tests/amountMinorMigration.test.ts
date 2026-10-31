import 'reflect-metadata';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DataSource } from 'typeorm';
import { createAppDataSource } from '../src/shared/infrastructure/database/database.config';
import { BASELINE_TABLES } from '../src/shared/infrastructure/database/migrations/1760600000000-Baseline';
import { verifyConversion } from '../src/shared/infrastructure/database/migrations/1760700000000-AmountMinor';
import { findSchemaDrift, runMigrationsWithBackup } from '../src/shared/infrastructure/database/migrationRunner';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';
import { recordsOn } from './helpers/records';

/** FT-097 on real SQLite files: existing amounts convert exactly, and 250 000 000 сум survive a round trip. */
describe('FT-097 amount_minor migration', () => {
  let dir: string;
  const open: DataSource[] = [];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft097-'));
  });

  afterEach(async () => {
    for (const ds of open.splice(0)) {
      if (ds.isInitialized) await ds.destroy();
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** A pre-migration database (what `synchronize` created) holding the given amounts. */
  async function oldDatabase(file: string, amounts: Array<number | string>): Promise<void> {
    const ds = new DataSource({ type: 'better-sqlite3', database: file });
    await ds.initialize();
    for (const sql of BASELINE_TABLES) await ds.query(sql);
    for (const [index, amount] of amounts.entries()) {
      await ds.query(
        `INSERT INTO transactions (id, amount, type, description, date, userId, category) VALUES (?, ?, 'expense', 'x', '2026-10-14', ?, 'other')`,
        [`tx-${index}`, amount, index % 2 === 0 ? 'user-a' : 'user-b']
      );
    }
    await ds.destroy();
  }

  async function migrated(file: string): Promise<DataSource> {
    const ds = createAppDataSource(file);
    open.push(ds);
    await ds.initialize();
    await runMigrationsWithBackup(ds, file, path.join(dir, 'backups'));
    return ds;
  }

  it('converts every amount to minor units exactly', async () => {
    const file = path.join(dir, 'db.sqlite');
    await oldDatabase(file, [25000, 186400, 19.99, 0.29, 250000000, '45000']);

    const ds = await migrated(file);

    const rows = await ds.query('SELECT id, amount_minor FROM transactions ORDER BY id');
    expect(rows).toEqual([
      { id: 'tx-0', amount_minor: 2500000 },
      { id: 'tx-1', amount_minor: 18640000 },
      { id: 'tx-2', amount_minor: 1999 },
      { id: 'tx-3', amount_minor: 29 },
      { id: 'tx-4', amount_minor: 25000000000 },
      { id: 'tx-5', amount_minor: 4500000 },
    ]);
    expect(await findSchemaDrift(ds)).toEqual([]);
  });

  it('stops without changing anything when an amount is not a number', async () => {
    const file = path.join(dir, 'bad.sqlite');
    await oldDatabase(file, [25000, 'около ста']);
    const ds = createAppDataSource(file);
    open.push(ds);
    await ds.initialize();

    await expect(runMigrationsWithBackup(ds, file, path.join(dir, 'backups'))).rejects.toThrow(/tx-1=около ста/);

    expect(await ds.query('SELECT id, amount FROM transactions ORDER BY id')).toEqual([
      { id: 'tx-0', amount: 25000 },
      { id: 'tx-1', amount: 'около ста' },
    ]);
  });

  it('refuses a conversion that lost or changed a row', () => {
    const before = [
      { id: 'a', userId: 'u', amount: 100, kind: 'integer' },
      { id: 'b', userId: 'u', amount: 1.5, kind: 'real' },
    ];
    expect(() => verifyConversion(before, [{ id: 'a', amount_minor: 10000 }])).toThrow(/2 rows before/);
    expect(() => verifyConversion(before, [
      { id: 'a', amount_minor: 10000 },
      { id: 'b', amount_minor: 15 },
    ])).toThrow(/b: 1.5 → 15/);
    expect(() => verifyConversion(before, [
      { id: 'a', amount_minor: 10000 },
      { id: 'b', amount_minor: 150 },
    ])).not.toThrow();
  });

  it('accepts amounts with more than two decimals, rounded row by row', () => {
    const before = [
      { id: 'a', userId: 'u', amount: 33333.333, kind: 'real' },
      { id: 'b', userId: 'u', amount: 33333.333, kind: 'real' },
      { id: 'c', userId: 'u', amount: 33333.333, kind: 'real' },
      { id: 'd', userId: 'v', amount: 10.005, kind: 'real' },
      { id: 'e', userId: 'v', amount: 10.005, kind: 'real' },
    ];
    const after = before.map(row => ({ id: row.id, amount_minor: Math.round(row.amount * 100) }));
    expect(() => verifyConversion(before, after)).not.toThrow();
  });

  it('saves 250 000 000 сум without loss, from the old amount and from amountMinor', async () => {
    const ds = await migrated(path.join(dir, 'new.sqlite'));
    const { repository, create } = recordsOn(ds);

    const legacy = await create.execute({
      userId: 'user-a', amount: 250000000, type: 'expense', category: 'other', description: 'Квартира', date: '2026-10-16',
    });
    // A new writer sends only amountMinor
    const modern = await create.execute({
      userId: 'user-a', amountMinor: 25000000000, type: 'expense', category: 'other', description: 'Квартира', date: '2026-10-16',
    } as unknown as Transaction);

    expect(legacy.success && modern.success).toBe(true);
    const stored = await repository.findByUserId('user-a');
    expect(stored.map(t => [t.amountMinor, t.amount])).toEqual([
      [25000000000, 250000000],
      [25000000000, 250000000],
    ]);
  });
});
