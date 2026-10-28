import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sqlite3 from 'sqlite3';

/**
 * `scripts/backup-db.sh` (FT-157): the nightly copy of the live database into the folder Google Drive syncs. Each test
 * runs the real script, copied into a scratch "live copy" with its own data/ and .env.local, against the sqlite3 CLI.
 */

const SCRIPT = path.join(__dirname, '..', 'scripts', 'backup-db.sh');
const NAME = /^daftar-\d{8}-\d{6}\.sqlite$/;

jest.setTimeout(30000);

let root: string;
let app: string;
let out: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-db-'));
  app = path.join(root, 'live');
  out = path.join(root, 'DaftarBackup');
  fs.mkdirSync(path.join(app, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(app, 'data'));
  fs.mkdirSync(out);
  fs.copyFileSync(SCRIPT, path.join(app, 'scripts', 'backup-db.sh'));
  sql(databaseFile(), "CREATE TABLE records(note TEXT); INSERT INTO records VALUES ('кофе'), ('такси'), ('обед');");
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function databaseFile(): string {
  return path.join(app, 'data', 'database.sqlite');
}

function sql(file: string, statement: string): string {
  return execFileSync('sqlite3', [file, statement], { encoding: 'utf8' }).trim();
}

function envLocal(lines: string[]): void {
  fs.writeFileSync(path.join(app, '.env.local'), `${lines.join('\n')}\n`);
}

/** Runs the script with a clean environment: only PATH and HOME, plus what the test passes */
function backup(env: Record<string, string> = {}) {
  const result = spawnSync('bash', [path.join(app, 'scripts', 'backup-db.sh')], {
    cwd: root,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', HOME: root, BACKUP_ALLOW_SAME_DISK: '1', ...env },
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function backups(): string[] {
  return fs.readdirSync(out).filter((name) => NAME.test(name)).sort();
}

function stamp(day: number): string {
  const date = new Date(Date.UTC(2026, 0, day, 4, 0, 0));
  return date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

describe('a backup', () => {
  it('is a checked copy of the database with the date in its name, and the JSON files of the same run', () => {
    fs.writeFileSync(path.join(app, 'data', 'patterns.json'), '{"merchants":{"evos":"cafe"}}');
    fs.writeFileSync(path.join(app, 'data', 'learning-data.json'), '[]');

    const { code, stdout } = backup({ BACKUP_DIR: out });

    expect(code).toBe(0);
    const [copy] = backups();
    expect(copy).toMatch(NAME);
    const base = copy.replace(/\.sqlite$/, '');
    expect(fs.readdirSync(out).sort()).toEqual(
      [`${base}.learning-data.json`, `${base}.patterns.json`, `${base}.sqlite`].sort()
    );
    expect(sql(path.join(out, copy), 'SELECT count(*) FROM records;')).toBe('3');
    expect(sql(path.join(out, copy), 'PRAGMA integrity_check;')).toBe('ok');
    expect(fs.readFileSync(path.join(out, `${base}.patterns.json`), 'utf8')).toBe('{"merchants":{"evos":"cafe"}}');
    expect(stdout).toContain('integrity ok');
  });

  it('is taken while the app holds a write open: committed records are in it, the unfinished one is not', async () => {
    const db = new sqlite3.Database(databaseFile());
    const run = (statement: string) =>
      new Promise<void>((resolve, reject) => db.run(statement, (error) => (error ? reject(error) : resolve())));
    await run('BEGIN IMMEDIATE');
    await run("INSERT INTO records VALUES ('ещё не записано')");

    const { code } = backup({ BACKUP_DIR: out });

    await run('ROLLBACK');
    await new Promise<void>((resolve) => db.close(() => resolve()));
    expect(code).toBe(0);
    expect(sql(path.join(out, backups()[0]), 'SELECT count(*) FROM records;')).toBe('3');
  });

  it('names the copy by the clock in TZ from .env.local', () => {
    envLocal(['TZ=Pacific/Kiritimati', `BACKUP_DIR=${out}`]);
    const local = () => {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Pacific/Kiritimati', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
      }).formatToParts(new Date());
      const get = (type: string) => parts.find((part) => part.type === type)?.value;
      return `daftar-${get('year')}${get('month')}${get('day')}-${get('hour')}`;
    };
    const before = local();

    const { code } = backup();

    expect(code).toBe(0);
    expect([before, local()]).toContain(backups()[0].slice(0, 18));
  });

  it('leaves out the JSON files the app has not written yet', () => {
    const { code, stdout } = backup({ BACKUP_DIR: out });

    expect(code).toBe(0);
    expect(fs.readdirSync(out)).toEqual(backups());
    expect(stdout).toContain('skipped: data/patterns.json data/learning-data.json');
  });

  it('keeps the database and fails when a JSON file never reads as whole JSON', () => {
    fs.writeFileSync(path.join(app, 'data', 'patterns.json'), '{"merchants":');
    fs.writeFileSync(path.join(app, 'data', 'learning-data.json'), '[]');

    const { code, stderr } = backup({ BACKUP_DIR: out });

    expect(code).toBe(1);
    expect(stderr).toContain('the database is backed up, but data/patterns.json never read as whole JSON');
    const base = backups()[0].replace(/\.sqlite$/, '');
    expect(fs.readdirSync(out).sort()).toEqual([`${base}.learning-data.json`, `${base}.sqlite`]);
  });

  it('writes nothing when the copy fails PRAGMA integrity_check', () => {
    sql(databaseFile(), 'CREATE INDEX records_note ON records(note);');
    const pageSize = Number(sql(databaseFile(), 'PRAGMA page_size;'));
    const indexRoot = Number(sql(databaseFile(), "SELECT rootpage FROM sqlite_master WHERE name = 'records_note';"));
    const file = fs.openSync(databaseFile(), 'r+');
    fs.writeSync(file, Buffer.alloc(12, 0xff), 0, 12, (indexRoot - 1) * pageSize);
    fs.closeSync(file);

    const { code, stderr } = backup({ BACKUP_DIR: out });

    expect(code).toBe(1);
    expect(stderr).toContain('fails PRAGMA integrity_check');
    expect(fs.readdirSync(out)).toEqual([]);
  });
});

describe('keeping 30', () => {
  it('deletes the copies older than the newest 30 and nothing that is not its own', () => {
    for (let day = 1; day <= 35; day += 1) {
      for (const suffix of ['.sqlite', '.patterns.json', '.learning-data.json']) {
        fs.writeFileSync(path.join(out, `daftar-${stamp(day)}${suffix}`), 'old');
      }
    }
    const foreign = ['notes.txt', 'daftar-manual.sqlite', `daftar-${stamp(1)}.sqlite.bak`, 'desktop.ini'];
    foreign.forEach((name) => fs.writeFileSync(path.join(out, name), 'not ours'));
    const stalePartial = path.join(out, `.daftar-${stamp(2)}.sqlite.partial`);
    const freshPartial = path.join(out, `.daftar-${stamp(3)}.sqlite.partial`);
    fs.writeFileSync(stalePartial, 'killed run');
    fs.writeFileSync(freshPartial, 'a run going on now');
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    fs.utimesSync(stalePartial, twoHoursAgo, twoHoursAgo);

    const { code, stdout } = backup({ BACKUP_DIR: out });

    expect(code).toBe(0);
    const kept = backups();
    expect(kept).toHaveLength(30);
    expect(kept[0]).toBe(`daftar-${stamp(7)}.sqlite`);
    expect(sql(path.join(out, kept[29]), 'SELECT count(*) FROM records;')).toBe('3');
    for (let day = 1; day <= 6; day += 1) {
      expect(fs.readdirSync(out).filter((name) => name.startsWith(`daftar-${stamp(day)}.`) && !name.endsWith('.bak'))).toEqual([]);
    }
    expect(fs.existsSync(path.join(out, `daftar-${stamp(7)}.patterns.json`))).toBe(true);
    foreign.forEach((name) => expect(fs.existsSync(path.join(out, name))).toBe(true));
    expect(fs.existsSync(stalePartial)).toBe(false);
    expect(fs.existsSync(freshPartial)).toBe(true);
    expect(stdout).toContain('copies kept: 30, old files removed: 18');
  });
});

describe('the backup folder', () => {
  it('comes from .env.local when the environment has none', () => {
    envLocal([`BACKUP_DIR="${out}"`]);

    expect(backup().code).toBe(0);
    expect(backups()).toHaveLength(1);
  });

  it.each([
    ['not set anywhere', [] as string[]],
    ['empty in .env.local', ['BACKUP_DIR=']],
  ])('is an error, not a quiet skip, when it is %s', (_case, lines) => {
    envLocal(lines);

    const { code, stderr } = backup();

    expect(code).toBe(1);
    expect(stderr).toContain('BACKUP_DIR is not set');
    expect(fs.readdirSync(out)).toEqual([]);
  });

  it('is an error when it does not exist, and the script does not create it', () => {
    const missing = path.join(root, 'mnt', 'c', 'DaftarBackup');

    const { code, stderr } = backup({ BACKUP_DIR: missing });

    expect(code).toBe(1);
    expect(stderr).toContain('does not exist or is not a folder');
    expect(fs.existsSync(path.join(root, 'mnt'))).toBe(false);
  });

  it('is an error when it is a relative path', () => {
    const { code, stderr } = backup({ BACKUP_DIR: 'DaftarBackup' });

    expect(code).toBe(1);
    expect(stderr).toContain('not an absolute path');
  });

  it('is refused on the same disk as the database, where a copy dies with it', () => {
    const { code, stderr } = backup({ BACKUP_DIR: out, BACKUP_ALLOW_SAME_DISK: '' });

    expect(code).toBe(1);
    expect(stderr).toContain('on the same disk');
    expect(fs.readdirSync(out)).toEqual([]);
  });
});

it('fails without a database and does not create one', () => {
  fs.rmSync(databaseFile());

  const { code, stderr } = backup({ BACKUP_DIR: out });

  expect(code).toBe(1);
  expect(stderr).toContain('no database at');
  expect(fs.existsSync(databaseFile())).toBe(false);
});
