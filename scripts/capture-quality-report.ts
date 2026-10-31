/**
 * FT-217 — capture quality report after two weeks of daily use (31 October — 14 November 2026).
 *
 * How many records needed a correction after they were written, and where: per day, per source, by field, the
 * «Нужно проверить» and «?» flags, Apple Pay payments without a matched card. The headline is the September goal:
 * «N из 10 без правки» and «дней подряд». How each number is reached is printed with it.
 *
 * Reads a COPY of the database only, read-only: the live `data/database.sqlite` is refused. No network, no AI, no
 * TypeORM (its data source would apply migrations). Prints counts, shares and dates — never an amount, a note, a
 * merchant, a phrase or a name: the query does not even return them.
 *
 * Usage (on the PC — docs/knowledge-base/08-development/live-instance.md, «Отчёт о качестве записи (FT-217)»):
 *   sqlite3 data/database.sqlite ".backup /tmp/kapelka-report.sqlite"
 *   scripts/nvm-exec.sh npm run report:quality -- --db=/tmp/kapelka-report.sqlite
 */

import fs from 'fs';
import path from 'path';
import { readCaptures } from './capture-quality/readCaptures';
import { summarize } from './capture-quality/summarize';
import { formatReport } from './capture-quality/formatReport';
import { daysBetween, isDay, tashkentDay } from './capture-quality/period';

const DEFAULT_FROM = '2026-10-31';
const DEFAULT_TO = '2026-11-14';
const MAX_DAYS = 366;

const USAGE = `FT-217 отчёт о качестве записи (только чтение копии базы)

  npm run report:quality -- --db=<копия базы> [--from=ГГГГ-ММ-ДД] [--to=ГГГГ-ММ-ДД] [--user=<Telegram id>]

  --db=<путь>      копия базы, снятая sqlite3 … ".backup …"; живая data/database.sqlite не читается
  --from=<день>    первый день периода, календарь Ташкента (по умолчанию ${DEFAULT_FROM})
  --to=<день>      последний день периода, включительно (по умолчанию ${DEFAULT_TO})
  --user=<id>      только записи одного пользователя: Telegram id или id пользователя в базе
  --help           эта справка

Ничего не пишет: файл открывается только для чтения. Печатает только числа, доли и даты.`;

export interface CliIo {
  out(text: string): void;
  err(text: string): void;
  now: Date;
  /** The app's folder: its data/database.sqlite is the live database. */
  appRoot: string;
}

interface Options {
  help: boolean;
  dbPath?: string;
  from: string;
  to: string;
  user?: string;
}

class UsageError extends Error {}

function dayOption(flag: string, value: string): string {
  if (!isDay(value)) throw new UsageError(`${flag}: нужен день ГГГГ-ММ-ДД, а не «${value}»`);
  return value;
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = { help: false, from: DEFAULT_FROM, to: DEFAULT_TO };
  for (const arg of argv) {
    const separator = arg.indexOf('=');
    const flag = separator === -1 ? arg : arg.slice(0, separator);
    const value = separator === -1 ? '' : arg.slice(separator + 1);
    switch (flag) {
      case '--help':
        options.help = true;
        break;
      case '--db':
        if (!value) throw new UsageError('--db: нужен путь к копии базы');
        options.dbPath = path.resolve(process.cwd(), value);
        break;
      case '--from':
        options.from = dayOption(flag, value);
        break;
      case '--to':
        options.to = dayOption(flag, value);
        break;
      case '--user':
        if (!value.trim()) throw new UsageError('--user: нужен Telegram id или id пользователя');
        options.user = value.trim();
        break;
      default:
        throw new UsageError(`Неизвестный параметр «${arg}». Справка: --help`);
    }
  }
  if (options.help) return options;
  if (!options.dbPath) throw new UsageError('Нужен --db=<копия базы>. Справка: --help');
  if (options.to < options.from) throw new UsageError(`--to (${options.to}) раньше --from (${options.from})`);
  if (daysBetween(options.from, options.to).length > MAX_DAYS) {
    throw new UsageError(`Период длиннее ${MAX_DAYS} дней: ${options.from} — ${options.to}`);
  }
  return options;
}

function realOrResolved(file: string): string {
  try {
    return fs.realpathSync(file);
  } catch {
    return path.resolve(file);
  }
}

/** The live database: this app's data/database.sqlite, or any data/database.sqlite — a copy is named otherwise. */
function isLiveDatabase(file: string, appRoot: string): boolean {
  const real = realOrResolved(file);
  if (real === realOrResolved(path.join(appRoot, 'data', 'database.sqlite'))) return true;
  return path.basename(real) === 'database.sqlite' && path.basename(path.dirname(real)) === 'data';
}

function checkCopy(dbPath: string, appRoot: string): void {
  if (isLiveDatabase(dbPath, appRoot)) {
    throw new UsageError(
      `${dbPath} — живая база. Отчёт читает только копию: ` +
      `sqlite3 data/database.sqlite ".backup /tmp/kapelka-report.sqlite" и --db=/tmp/kapelka-report.sqlite`
    );
  }
  if (!fs.existsSync(dbPath)) throw new UsageError(`нет файла ${dbPath}: сначала сними копию базы (.backup)`);
  if (!fs.statSync(dbPath).isFile()) throw new UsageError(`${dbPath} — не файл`);
}

export async function main(argv: readonly string[], io: CliIo): Promise<number> {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      io.out(USAGE);
      return 0;
    }
    const dbPath = options.dbPath!;
    checkCopy(dbPath, io.appRoot);
    const rows = await readCaptures({ dbPath, from: options.from, to: options.to, user: options.user });
    const report = summarize(rows, { from: options.from, to: options.to }, tashkentDay(io.now));
    io.out(formatReport(report, { dbPath }));
    return 0;
  } catch (error) {
    io.err(`report:quality: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (require.main === module) {
  main(process.argv.slice(2), {
    out: text => process.stdout.write(`${text}\n`),
    err: text => process.stderr.write(`${text}\n`),
    now: new Date(),
    appRoot: path.resolve(__dirname, '..'),
  }).then(code => {
    process.exitCode = code;
  });
}
