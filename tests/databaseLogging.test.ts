import 'reflect-metadata';
import { AppConfig } from '../src/shared/infrastructure/config/appConfig';
import { createAppDataSource } from '../src/shared/infrastructure/database/database.config';
import { Account } from '../src/shared/infrastructure/database/entities';
import { captureLogLines, LogCapture, levelOf } from './helpers/logLines';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';

/**
 * #295: TypeORM's own lines — a failed query, a failed migration — go through the app's logger, category DATABASE.
 * TypeORM's console logger wrote them with console.log: plain text among the JSON lines of production, and noise in
 * Jest, where the app's logger is silent. A failed query is written without any value: no parameter, and every literal
 * of its text as `?` — TypeORM writes numbers (an amount) straight into the SQL of SQLite (review of PR #392).
 */

const NOTE = 'кофе с собой';
const AMOUNT_MINOR = 5_123_400;

/** The query and the error of a captured line: «error [DATABASE] Query failed {"query":"…"}», then the error. */
function partsOf(line: string): { query: string; error: string } {
  const [head, ...error] = line.trimEnd().split('\n');
  return { query: JSON.parse(head.slice(head.indexOf('{'))).query, error: error.join('\n') };
}

/** The clock alone is set (`Date`): the line reaches the capture through real timers. */
function setClock(clock: string): void {
  const [hours, minutes, seconds] = clock.split(':').map(Number);
  jest.useFakeTimers({
    now: new Date(2026, 10, 18, hours, minutes, seconds),
    doNotFake: [
      'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback',
      'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
    ],
  });
}

describe('TypeORM lines go through the app logger (#295)', () => {
  let db: TestDatabase;
  let capture: LogCapture;
  let consoleLines: jest.SpyInstance[];

  beforeEach(async () => {
    db = await openMigratedDatabase();
    capture = captureLogLines();
    // TypeORM's console logger writes with console.log (PlatformTools); kept off the test output while it is checked
    consoleLines = (['log', 'info', 'warn', 'error'] as const).map(method => jest.spyOn(console, method).mockImplementation(() => undefined));
  });

  afterEach(async () => {
    jest.useRealTimers();
    capture.restore();
    consoleLines.forEach(spy => spy.mockRestore());
    await db.close();
  });

  const consoleCalls = () => consoleLines.reduce((sum, spy) => sum + spy.mock.calls.length, 0);

  it('a failed query is one DATABASE error line with the query and the error, without its parameters', async () => {
    await expect(db.dataSource.query('SELECT * FROM no_such_table WHERE note = ?', [NOTE])).rejects.toThrow(/no such table/);

    const lines = await capture.lines();
    expect(lines).toHaveLength(1);
    expect(levelOf(lines[0])).toBe('error');
    expect(lines[0]).toContain('[DATABASE]');
    expect(lines[0]).toContain('Query failed');
    expect(lines[0]).toContain('SELECT * FROM no_such_table WHERE note = ?');
    expect(lines[0]).toContain('no such table: no_such_table');
    expect(lines[0]).not.toContain(NOTE);
    expect(consoleCalls()).toBe(0);
  });

  it('a write that fails keeps out the amount TypeORM wrote into the SQL and the note it sent as a parameter', async () => {
    // The same row twice: the second is refused, as one of two identical requests at once is by UNIQUE(userId, client_id)
    const account = {
      id: 'acc-1', userId: 'user-1', name: NOTE, kind: 'cash', currency: 'UZS', openingBalanceMinor: AMOUNT_MINOR,
      openingDate: '2026-11-16', isHidden: false, sortOrder: 70,
    };
    await db.dataSource.getRepository(Account).insert(account);
    await expect(db.dataSource.getRepository(Account).insert(account)).rejects.toThrow(/UNIQUE constraint failed/);

    const lines = await capture.lines();
    expect(lines).toHaveLength(1);
    // TypeORM wrote 5123400, false (0) and 70 into the text, the rest went as parameters; NULL is no value
    expect(partsOf(lines[0])).toEqual({
      query:
        'INSERT INTO "accounts"("id", "user_id", "name", "kind", "currency", "opening_balance_minor", "opening_date", ' +
        '"opening_at", "is_hidden", "sort_order", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)',
      error: 'SQLITE_CONSTRAINT: UNIQUE constraint failed: accounts.id',
    });
    for (const value of [String(AMOUNT_MINOR), '70', NOTE, 'user-1', '2026-11-16']) expect(lines[0]).not.toContain(value);
  });

  // #432: the logger begins a line with the clock, «21:50:22 error …», and one of the literals is 50 — at :50 the clock
  // itself held a value the line must not hold. Captured lines come without it; checked at such a minute and second,
  // and at both ends of the day
  it.each(['00:00:00', '12:50:50', '23:59:59'])('writes every literal of the SQL and of the error as ? and keeps the names (clock at %s)', async clock => {
    setClock(clock);
    db.dataSource.logger.logQueryError(
      `near "${AMOUNT_MINOR}": syntax error; unrecognized token: "'${NOTE}"`,
      `UPDATE "transactions" SET "description" = 'кофе ''с'' собой', "amount_minor" = ${AMOUNT_MINOR}, "rate" = 12.65, ` +
        `"big" = 1e6, "blob" = X'0A1B', "hex" = 0x1F, "user_id2" = ? WHERE "t1"."id" = ? AND amount_minor > -5 LIMIT 50`,
      [NOTE, 'user-1']
    );

    const lines = await capture.lines();
    expect(lines).toHaveLength(1);
    expect(partsOf(lines[0])).toEqual({
      query:
        'UPDATE "transactions" SET "description" = ?, "amount_minor" = ?, "rate" = ?, "big" = ?, "blob" = X?, "hex" = ?, ' +
        '"user_id2" = ? WHERE "t1"."id" = ? AND amount_minor > -? LIMIT ?',
      error: 'near "?": syntax error; unrecognized token: "?',
    });
    for (const value of ['кофе', 'собой', String(AMOUNT_MINOR), '12.65', '1e6', '0A1B', '0x1F', '50', 'user-1']) {
      expect(lines[0]).not.toContain(value);
    }
  });

  it('keeps the parameters out even where sqlite3 puts them into the error\'s stack', async () => {
    // sqlite3's verbose mode, which TypeORM turns on, adds «--> in Database#all('…', [ 'кофе с собой' ], …)» to the stack
    const error = new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed: transactions.userId, transactions.client_id');
    error.stack = `${error.stack}\n--> in Database#all('INSERT INTO "transactions" …', [ '${NOTE}' ], [Function: handler])`;

    db.dataSource.logger.logQueryError(error, 'INSERT INTO "transactions" …', [NOTE]);

    const lines = await capture.lines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('UNIQUE constraint failed: transactions.userId, transactions.client_id');
    expect(lines[0]).not.toContain(NOTE);
  });

  it('a failed migration is a DATABASE error line', async () => {
    // TypeORM calls logMigration only when a migration fails (MigrationExecutor)
    db.dataSource.logger.logMigration('Migration "Example1760000000000" failed, error: boom');

    const lines = await capture.lines();
    expect(lines).toHaveLength(1);
    expect(levelOf(lines[0])).toBe('error');
    expect(lines[0]).toContain('[DATABASE]');
    expect(lines[0]).toContain('Migration "Example1760000000000" failed, error: boom');
    expect(consoleCalls()).toBe(0);
  });

  it('a query that works writes nothing', async () => {
    await db.dataSource.query('SELECT count(*) AS n FROM transactions WHERE description = ?', [NOTE]);

    expect(await capture.lines()).toEqual([]);
    expect(consoleCalls()).toBe(0);
  });

  it('TypeORM warnings are written in development only, as before', async () => {
    db.dataSource.logger.log('warn', 'a warning of TypeORM');
    expect(await capture.lines()).toEqual([]);

    const development = jest.replaceProperty(AppConfig, 'NODE_ENV', 'development');
    try {
      createAppDataSource(':memory:').logger.log('warn', 'a warning of TypeORM');
    } finally {
      development.restore();
    }

    const lines = await capture.lines();
    expect(lines).toHaveLength(1);
    expect(levelOf(lines[0])).toBe('warn');
    expect(lines[0]).toContain('[DATABASE]');
    expect(lines[0]).toContain('a warning of TypeORM');
    expect(consoleCalls()).toBe(0);
  });
});
