import sqlite3 from 'sqlite3';
import { TASHKENT_OFFSET_HOURS } from './period';

/**
 * Reads the records of a period from a copy of the database for the capture quality report (FT-217).
 *
 * Read-only by construction: the file is opened `OPEN_READONLY` (never created, never written — the driver refuses),
 * `PRAGMA query_only` is on, and only `PRAGMA table_info` and one `SELECT` are issued. TypeORM is not used: its data
 * source would apply pending migrations.
 *
 * Private by construction: the query compares amounts, categories and texts inside SQLite and returns only a day, a
 * source and yes/no facts. No amount, note, merchant, phrase or name ever reaches this process, so none can be printed.
 */

/** One record of the period, as facts only. */
export interface CaptureRow {
  /** YYYY-MM-DD on the Tashkent calendar of `createdAt`: the day it was written. */
  day: string;
  /** Counted, never printed. */
  userId: string;
  /** `transactions.source` as stored: telegram, miniapp, ios_shortcut, apple_pay, receipt, manual; null for old ones. */
  source: string | null;
  /** A bot message shows it: true when that message was a voice (the bot «heard» it). Null when no message shows it. */
  botVoice: boolean | null;
  /** The bot message still shows «?» at its category: nobody picked or confirmed one (`state.guessed`). */
  botGuessed: boolean;
  /** The last change of its bot message was its account (`state.changed` «Счёт: …»). */
  botLastAccount: boolean;
  /** The last change of its bot message was its date (`state.changed` «Дата: …»). */
  botLastDate: boolean;
  deleted: boolean;
  /** `updatedAt` later than `createdAt`: something in the record changed after it was written. */
  touched: boolean;
  /** `originalParsing` is there: what the parse gave when the record was written. */
  hasParse: boolean;
  categorySnapshot: boolean;
  amountSnapshot: boolean;
  /** The category now is not the one the parse wrote it to (`originalParsing.categoryId`, FT-184). */
  categoryChanged: boolean;
  /** The amount now is not the parse's (`originalParsing.amount`, in major units). */
  amountChanged: boolean;
  /** The type or the semantic type now is not the parse's. */
  typeChanged: boolean;
  /** The parse flagged it «Нужно проверить» (`originalParsing.needsReview`). */
  flaggedByParse: boolean;
  /** It is flagged «Нужно проверить» now. */
  flaggedNow: boolean;
  /** Its currency is not its account's: dollars written to a сум account. */
  currencyMismatch: boolean;
}

export interface CaptureQuery {
  dbPath: string;
  from: string;
  to: string;
  /** A Telegram id or a user id; all users when absent. */
  user?: string;
}

const REQUIRED_COLUMNS: Record<string, readonly string[]> = {
  transactions: [
    'id', 'userId', 'source', 'createdAt', 'updatedAt', 'deleted_at', 'needsReview', 'originalParsing', 'category_id',
    'account_id', 'amount_minor', 'type', 'semanticType', 'currency',
  ],
  bot_messages: ['record_ids', 'state', 'heard'],
  accounts: ['id', 'currency'],
  users: ['id', 'telegram_id'],
};

const DAY_OF = (column: string) => `date(${column}, '+${TASHKENT_OFFSET_HOURS} hours')`;

/** Booleans from SQLite come as 0/1 (or NULL); the parse JSON is read only where it is valid JSON. */
const CAPTURES_SQL = `
WITH
messages AS (
  SELECT record_ids, state, heard FROM bot_messages WHERE json_valid(record_ids) AND json_valid(state)
),
shown AS (
  SELECT r.value AS record_id,
         MAX(m.heard IS NOT NULL AND trim(m.heard) <> '') AS voiced,
         MAX(EXISTS (SELECT 1 FROM json_each(m.state, '$.guessed') g WHERE g.value = r.value)) AS guessed
  FROM messages m, json_each(m.record_ids) r
  GROUP BY r.value
),
last_change AS (
  SELECT json_extract(m.record_ids, '$[' || CAST(COALESCE(json_extract(m.state, '$.selected'), 0) AS INTEGER) || ']') AS record_id,
         MAX(instr(COALESCE(json_extract(m.state, '$.changed'), ''), 'Счёт:') = 1) AS account,
         MAX(instr(COALESCE(json_extract(m.state, '$.changed'), ''), 'Дата:') = 1) AS date
  FROM messages m
  GROUP BY 1
),
records AS (
  SELECT t.*, CASE WHEN json_valid(t.originalParsing) THEN t.originalParsing END AS parse
  FROM transactions t
  WHERE ${DAY_OF('t.createdAt')} BETWEEN $from AND $to
    AND ($user IS NULL OR t.userId = $user OR t.userId IN (SELECT id FROM users WHERE telegram_id = $user))
)
SELECT
  ${DAY_OF('r.createdAt')} AS day,
  r.userId AS userId,
  r.source AS source,
  s.voiced AS botVoice,
  COALESCE(s.guessed, 0) AS botGuessed,
  COALESCE(l.account, 0) AS botLastAccount,
  COALESCE(l.date, 0) AS botLastDate,
  r.deleted_at IS NOT NULL AS deleted,
  COALESCE(julianday(r.updatedAt) > julianday(r.createdAt), 0) AS touched,
  r.parse IS NOT NULL AS hasParse,
  json_extract(r.parse, '$.categoryId') IS NOT NULL AS categorySnapshot,
  COALESCE(json_type(r.parse, '$.amount') IN ('integer', 'real'), 0) AS amountSnapshot,
  COALESCE(json_extract(r.parse, '$.categoryId') <> r.category_id, 0) AS categoryChanged,
  CASE WHEN json_type(r.parse, '$.amount') IN ('integer', 'real')
       THEN abs(round(json_extract(r.parse, '$.amount') * 100) - r.amount_minor) >= 1 ELSE 0 END AS amountChanged,
  COALESCE(json_extract(r.parse, '$.type') <> r.type, 0)
    OR COALESCE(json_extract(r.parse, '$.semanticType') <> r.semanticType, 0) AS typeChanged,
  COALESCE(json_extract(r.parse, '$.needsReview'), 0) = 1 AS flaggedByParse,
  r.needsReview = 1 AS flaggedNow,
  COALESCE(r.currency <> a.currency, 0) AS currencyMismatch
FROM records r
LEFT JOIN shown s ON s.record_id = r.id
LEFT JOIN last_change l ON l.record_id = r.id
LEFT JOIN accounts a ON a.id = r.account_id
`;

type Raw = Record<string, string | number | null>;

function openReadOnly(file: string): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(file, sqlite3.OPEN_READONLY, error => (error ? reject(error) : resolve(db)));
  });
}

function all(db: sqlite3.Database, sql: string, params: Record<string, unknown> = {}): Promise<Raw[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error: Error | null, rows: Raw[]) => (error ? reject(error) : resolve(rows)));
  });
}

function close(db: sqlite3.Database): Promise<void> {
  return new Promise(resolve => db.close(() => resolve()));
}

/** The tables and columns the query reads: a database older than them is named, not half read. */
async function assertSchema(db: sqlite3.Database): Promise<void> {
  const missing: string[] = [];
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const present = new Set((await all(db, `PRAGMA table_info("${table}")`)).map(column => String(column.name)));
    if (present.size === 0) {
      missing.push(`таблицы ${table}`);
      continue;
    }
    missing.push(...columns.filter(column => !present.has(column)).map(column => `${table}.${column}`));
  }
  if (missing.length > 0) {
    throw new Error(
      `В базе нет ${missing.join(', ')}: она старее схемы, которую читает отчёт. Сними копию с живой базы после ` +
      'обновления (scripts/live-update.sh).'
    );
  }
}

const flag = (value: string | number | null) => Number(value) === 1;

function toRow(raw: Raw): CaptureRow {
  return {
    day: String(raw.day),
    userId: String(raw.userId),
    source: raw.source === null ? null : String(raw.source),
    botVoice: raw.botVoice === null ? null : flag(raw.botVoice),
    botGuessed: flag(raw.botGuessed),
    botLastAccount: flag(raw.botLastAccount),
    botLastDate: flag(raw.botLastDate),
    deleted: flag(raw.deleted),
    touched: flag(raw.touched),
    hasParse: flag(raw.hasParse),
    categorySnapshot: flag(raw.categorySnapshot),
    amountSnapshot: flag(raw.amountSnapshot),
    categoryChanged: flag(raw.categoryChanged),
    amountChanged: flag(raw.amountChanged),
    typeChanged: flag(raw.typeChanged),
    flaggedByParse: flag(raw.flaggedByParse),
    flaggedNow: flag(raw.flaggedNow),
    currencyMismatch: flag(raw.currencyMismatch),
  };
}

export async function readCaptures(query: CaptureQuery): Promise<CaptureRow[]> {
  const db = await openReadOnly(query.dbPath);
  try {
    await all(db, 'PRAGMA query_only = ON');
    await assertSchema(db);
    const rows = await all(db, CAPTURES_SQL, { $from: query.from, $to: query.to, $user: query.user ?? null });
    return rows.map(toRow);
  } finally {
    await close(db);
  }
}
