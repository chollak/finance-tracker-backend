import 'reflect-metadata';
import { AppConfig } from '../src/shared/infrastructure/config/appConfig';
import { createAppDataSource } from '../src/shared/infrastructure/database/database.config';
import { captureLogLines, LogCapture, levelOf } from './helpers/logLines';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';

/**
 * #295: TypeORM's own lines — a failed query, a failed migration — go through the app's logger, category DATABASE.
 * TypeORM's console logger wrote them with console.log: plain text among the JSON lines of production, and noise in
 * Jest, where the app's logger is silent. A failed query is written without its parameters: they carry a record's note
 * and amount.
 */

const NOTE = 'кофе с собой';

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
