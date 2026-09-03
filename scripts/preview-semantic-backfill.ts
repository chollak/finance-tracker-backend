/**
 * FT-045 — read-only preview of a historical semantic backfill.
 *
 * Every transaction created before FT-SEM-001 was stored with `semanticType = 'expense'`, transfers
 * and debts included. This script reads those rows and prints what a backfill *would* propose, using
 * the same keyword vocabulary the live text parser uses. It decides nothing and applies nothing.
 *
 * Read-only by construction, not by convention:
 *   - the SQLite file is opened with `OPEN_READONLY`, so the driver itself rejects any write;
 *   - the only statements issued are `PRAGMA table_info` and one `SELECT`;
 *   - TypeORM is deliberately not used — `AppDataSource` runs with `synchronize: true` in
 *     development and would alter the schema just by connecting.
 *
 * Usage:
 *   npm run preview:semantic
 *   npm run preview:semantic -- --format=json --examples=3
 *   npx ts-node scripts/preview-semantic-backfill.ts --db=data/database.sqlite --user=<userId>
 *
 * Options:
 *   --db=<path>        SQLite file to read (default: data/database.sqlite)
 *   --format=<fmt>     markdown (default) or json
 *   --user=<userId>    limit the preview to one user
 *   --examples=<n>     rows shown per rule group (default: 5)
 *   --disputed=<n>     uncertain rows listed in full (default: 20)
 *   --skip-archived    ignore archived rows (they are included by default)
 *   --full             json only: include every candidate row, not just the examples
 *   --help
 *
 * Supabase is out of scope: the active local path is SQLite, and the Supabase project is paused
 * (see FT-046). Point `--db` at a SQLite file or run nothing.
 */

import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import {
  PreviewedRow,
  SemanticBackfillPreview,
  previewSemanticBackfill,
} from '../src/modules/transaction/application/previewSemanticBackfill';
import { StoredTransactionRow } from '../src/modules/transaction/domain/semanticBackfillSuggestion';

interface CliOptions {
  dbPath: string;
  format: 'markdown' | 'json';
  userId?: string;
  examplesPerRule: number;
  disputedLimit: number;
  skipArchived: boolean;
  full: boolean;
}

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'database.sqlite');

// Read what exists; a database created before the semantic columns were added simply reports fewer.
const WANTED_COLUMNS = [
  'id', 'date', 'createdAt', 'amount', 'type', 'semanticType', 'needsReview', 'category',
  'description', 'originalText', 'merchant', 'isArchived', 'isDebtRelated', 'relatedDebtId',
  'userId',
];

const USAGE = `FT-045 historical semantic backfill preview (read-only)

  npm run preview:semantic -- [options]
  npx ts-node scripts/preview-semantic-backfill.ts [options]

  --db=<path>       SQLite file to read (default: data/database.sqlite)
  --format=<fmt>    markdown (default) | json
  --user=<userId>   limit the preview to one user
  --examples=<n>    rows shown per rule group (default: 5)
  --disputed=<n>    uncertain rows listed in full (default: 20)
  --skip-archived   ignore archived rows
  --full            json only: include every candidate row
  --help            show this text

Writes nothing: the database is opened read-only and only SELECT/PRAGMA are issued.`;

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dbPath: DEFAULT_DB_PATH,
    format: 'markdown',
    examplesPerRule: 5,
    disputedLimit: 20,
    skipArchived: false,
    full: false,
  };

  for (const arg of argv) {
    const [flag, rawValue] = arg.split('=');
    const value = rawValue ?? '';

    switch (flag) {
      case '--db':
        if (!value) throw new Error('--db requires a path');
        options.dbPath = path.resolve(process.cwd(), value);
        break;
      case '--format':
        if (value !== 'markdown' && value !== 'json') {
          throw new Error(`Unknown --format "${value}" (expected markdown or json)`);
        }
        options.format = value;
        break;
      case '--user':
        if (!value) throw new Error('--user requires a userId');
        options.userId = value;
        break;
      case '--examples':
      case '--disputed': {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${flag} requires a non-negative number`);
        if (flag === '--examples') options.examplesPerRule = parsed;
        else options.disputedLimit = parsed;
        break;
      }
      case '--skip-archived':
        options.skipArchived = true;
        break;
      case '--full':
        options.full = true;
        break;
      default:
        throw new Error(`Unknown option "${arg}"`);
    }
  }

  return options;
}

function openReadOnly(dbPath: string): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, error => {
      if (error) reject(error);
      else resolve(db);
    });
  });
}

function all<T>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error: Error | null, rows: T[]) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

function closeDb(db: sqlite3.Database): Promise<void> {
  return new Promise(resolve => db.close(() => resolve()));
}

async function loadRows(options: CliOptions): Promise<StoredTransactionRow[]> {
  const db = await openReadOnly(options.dbPath);
  try {
    const columns = await all<{ name: string }>(db, 'PRAGMA table_info(transactions)');
    if (columns.length === 0) {
      throw new Error(`No "transactions" table in ${options.dbPath}`);
    }

    const available = new Set(columns.map(column => column.name));
    const selected = WANTED_COLUMNS.filter(column => available.has(column));
    if (!selected.includes('id')) {
      throw new Error('The "transactions" table has no id column — refusing to guess row identity');
    }

    const where: string[] = [];
    const params: unknown[] = [];
    if (options.userId) {
      where.push('userId = ?');
      params.push(options.userId);
    }
    if (options.skipArchived && available.has('isArchived')) {
      where.push('(isArchived IS NULL OR isArchived = 0)');
    }

    const sql = [
      `SELECT ${selected.map(column => `"${column}"`).join(', ')} FROM transactions`,
      where.length ? `WHERE ${where.join(' AND ')}` : '',
      available.has('createdAt') ? 'ORDER BY createdAt ASC' : '',
    ].filter(Boolean).join(' ');

    const rows = await all<Record<string, unknown>>(db, sql, params);
    return rows.map(toStoredRow);
  } finally {
    await closeDb(db);
  }
}

function asText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asFlag(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  return value === 1 || value === true || value === '1';
}

function toStoredRow(row: Record<string, unknown>): StoredTransactionRow {
  const amount = Number(row.amount);
  return {
    id: String(row.id),
    date: asText(row.date),
    createdAt: asText(row.createdAt),
    amount: Number.isFinite(amount) ? amount : null,
    type: asText(row.type),
    semanticType: asText(row.semanticType),
    needsReview: asFlag(row.needsReview),
    category: asText(row.category),
    description: asText(row.description),
    originalText: asText(row.originalText),
    merchant: asText(row.merchant),
    isArchived: asFlag(row.isArchived),
    isDebtRelated: asFlag(row.isDebtRelated),
    relatedDebtId: asText(row.relatedDebtId),
  };
}

const amountFormatter = new Intl.NumberFormat('ru-RU');

function formatAmount(amount: number | null): string {
  return amount === null ? '—' : amountFormatter.format(amount);
}

function truncate(text: string, limit = 90): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (!collapsed) return '—';
  return collapsed.length > limit ? `${collapsed.slice(0, limit - 1)}…` : collapsed;
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|');
}

function rowLine(row: PreviewedRow): string {
  const suggested = row.suggestion.suggestedType ?? '—';
  const marker = row.suggestion.needsReview ? ' ⚠️' : '';
  const archived = row.isArchived ? ' [архив]' : '';
  return `| \`${row.id.slice(0, 8)}\` | ${cell(row.date ?? '—')} | ${cell(formatAmount(row.amount))} `
    + `| ${cell(row.type ?? '—')} | ${cell(row.category ?? '—')} | ${suggested}${marker}${archived} `
    + `| ${cell(truncate(row.text))} |`;
}

const ROW_TABLE_HEADER = [
  '| id | дата | сумма | type | категория | предложение | текст |',
  '| --- | --- | --- | --- | --- | --- | --- |',
].join('\n');

function renderMarkdown(preview: SemanticBackfillPreview, options: CliOptions): string {
  const { totals } = preview;
  const lines: string[] = [];

  lines.push('# FT-045 — предпросмотр семантического backfill (read-only)');
  lines.push('');
  lines.push(`- база: \`${options.dbPath}\` (открыта только на чтение, ни одной записи не сделано)`);
  lines.push(`- сформировано: ${new Date().toISOString()}`);
  if (options.userId) lines.push(`- фильтр по пользователю: \`${options.userId}\``);
  if (options.skipArchived) lines.push('- архивные строки исключены (`--skip-archived`)');
  lines.push('');

  lines.push('## Счётчики');
  lines.push('');
  lines.push('| показатель | значение |');
  lines.push('| --- | --- |');
  lines.push(`| прочитано строк | ${totals.scanned} |`);
  lines.push(`| уже с осмысленным semanticType (не трогаем) | ${totals.alreadyTyped} |`);
  lines.push(`| кандидатов на backfill (semanticType=expense) | ${totals.candidates} |`);
  lines.push(`| из них в архиве | ${totals.archivedCandidates} |`);
  lines.push(`| уверенных предложений | ${totals.confident} |`);
  lines.push(`| спорных (кандидаты в needsReview) | ${totals.needsReview} |`);
  lines.push(`| без совпадений (остаются расходом) | ${totals.unmatched} |`);
  lines.push('');

  lines.push('## Предполагаемые типы');
  lines.push('');
  const suggestedEntries = Object.entries(preview.bySuggestedType).sort((a, b) => b[1] - a[1]);
  if (suggestedEntries.length === 0) {
    lines.push('_Ни одного предложения._');
  } else {
    lines.push('| semanticType | строк |');
    lines.push('| --- | --- |');
    for (const [type, count] of suggestedEntries) lines.push(`| ${type} | ${count} |`);
  }
  lines.push('');

  lines.push('## Правила');
  lines.push('');
  lines.push('| правило | предложение | статус | строк |');
  lines.push('| --- | --- | --- | --- |');
  for (const group of preview.byRule) {
    const status = group.suggestedType === null
      ? 'без изменений'
      : group.needsReview ? 'спорно → needsReview' : 'уверенно';
    lines.push(`| ${group.rule} | ${group.suggestedType ?? '—'} | ${status} | ${group.count} |`);
  }
  lines.push('');

  if (options.examplesPerRule > 0) {
    lines.push('## Примеры по правилам');
    lines.push('');
    for (const group of preview.byRule) {
      lines.push(`### ${group.rule} — ${group.count} строк`);
      lines.push('');
      if (group.examples.length === 0) {
        lines.push('_Примеры отключены (`--examples=0`)._');
      } else {
        lines.push(`_${group.examples[0].suggestion.reason}_`);
        lines.push('');
        lines.push(ROW_TABLE_HEADER);
        for (const row of group.examples) lines.push(rowLine(row));
      }
      lines.push('');
    }
  }

  lines.push('## Спорные случаи');
  lines.push('');
  if (preview.disputed.length === 0) {
    lines.push('_Спорных строк нет._');
  } else {
    lines.push(`Показано ${preview.disputed.length} из ${totals.needsReview}. `
      + 'Каждая такая строка — кандидат в `needsReview`, а не готовое решение.');
    lines.push('');
    lines.push(ROW_TABLE_HEADER);
    for (const row of preview.disputed) lines.push(rowLine(row));
  }
  lines.push('');

  lines.push('## Что дальше');
  lines.push('');
  lines.push('Отчёт ничего не применяет. Решение о реальном backfill принимает Шукур отдельно '
    + '(FT-045 DoD), и применение потребует отдельной задачи с явным разрешением.');
  lines.push('');

  return lines.join('\n');
}

function renderJson(preview: SemanticBackfillPreview, options: CliOptions): string {
  return JSON.stringify({
    task: 'FT-045',
    mode: 'read-only preview',
    generatedAt: new Date().toISOString(),
    database: options.dbPath,
    filters: {
      userId: options.userId ?? null,
      skipArchived: options.skipArchived,
    },
    totals: preview.totals,
    bySuggestedType: preview.bySuggestedType,
    byRule: preview.byRule,
    disputed: preview.disputed,
    rows: options.full ? preview.rows : undefined,
  }, null, 2);
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    return 0;
  }

  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`${(error as Error).message}\n\n${USAGE}`);
    return 1;
  }

  if (!fs.existsSync(options.dbPath)) {
    console.error(`SQLite file not found: ${options.dbPath}\nPass --db=<path> to point at another one.`);
    return 1;
  }

  const rows = await loadRows(options);
  const preview = previewSemanticBackfill(rows, {
    examplesPerRule: options.examplesPerRule,
    disputedLimit: options.disputedLimit,
  });

  console.log(options.format === 'json' ? renderJson(preview, options) : renderMarkdown(preview, options));
  return 0;
}

main()
  .then(code => { process.exitCode = code; })
  .catch(error => {
    console.error(`Preview failed: ${(error as Error).message}`);
    process.exitCode = 1;
  });
