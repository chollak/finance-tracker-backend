import { CaptureRow } from './readCaptures';
import { daysBetween, Streaks, streaksOf } from './period';

/**
 * The numbers of the capture quality report (FT-217), from the records of a period. Pure: rows in, counts out.
 *
 * - **The period and the days are the days of the operation** (`date`): a phrase of the 24th that the iOS queue sent on
 *   the 1st is the 24th's, and a payment of the 14th sent on the 15th is in a period that ends on the 14th. The series
 *   by the day sent (`createdAt`) is counted beside it.
 * - **Without a correction is a range.** At least: not deleted, not changed after it was written (`updatedAt` =
 *   `createdAt`, the parse snapshot equals the record). At most: also the records changed only where no snapshot is —
 *   the account, the date, the note, the flag — since a confirmation that changed nothing (the same category put again,
 *   «Да, верная» on a large amount, a flag taken off a right record) touches a record just the same.
 * - **A record still waiting** — «Нужно проверить» or «?» still on it — is without a correction in neither bound.
 * - **Deleted records count**, as corrected: a record deleted after it was written is a capture that went wrong.
 * - **The goal «7 из 10» counts automatic capture only** — the bot, iOS, Apple Pay, the Mini App phrase or voice
 *   (Shukur's decision 2026-11-01). Manual input is shown apart.
 */

export interface SourceSpec {
  key: string;
  label: string;
  /** Shown with 0 too: the ways Shukur writes every day. */
  always: boolean;
}

export const SOURCES: readonly SourceSpec[] = [
  { key: 'bot_text', label: 'бот · текст', always: true },
  { key: 'bot_voice', label: 'бот · голос', always: true },
  { key: 'bot_unshown', label: 'бот · без сообщения', always: false },
  { key: 'ios', label: 'iOS · голос или текст', always: true },
  { key: 'apple_pay', label: 'Apple Pay', always: true },
  { key: 'miniapp', label: 'Mini App · фраза или голос', always: true },
  { key: 'manual', label: 'вручную', always: true },
  { key: 'receipt', label: 'чек', always: false },
  { key: 'none', label: 'без источника', always: false },
];

/** The sources of the goal: what a parse wrote, not a person. */
const AUTOMATIC_SOURCES: ReadonlySet<string> = new Set(['telegram', 'ios_shortcut', 'apple_pay', 'miniapp']);

export interface Tally {
  captured: number;
  /** Kept and changed after it was written. */
  edited: number;
  deleted: number;
  /** Kept with «Нужно проверить» or «?» still on it. */
  waiting: number;
  /** Without a correction, at least. */
  clean: number;
  /** Without a correction, at most: also the records touched only where no snapshot is. */
  cleanAtMost: number;
}

export interface SourceTally extends Tally {
  key: string;
  label: string;
}

export interface DayTally {
  day: string;
  kept: number;
  deleted: number;
}

export interface Calendar {
  days: DayTally[];
  daysWithout: string[];
  streaks: Streaks;
}

export interface QualityReport {
  from: string;
  to: string;
  today: string;
  /** The newest record of the whole copy, Tashkent time: how fresh the copy is. */
  lastRecordAt: string | null;
  /** By the day of the operation, the period up to today. */
  calendar: Calendar;
  /** By the day sent (`createdAt`). */
  sentCalendar: Calendar;
  /** The part of the period after today, if any: not counted. */
  future: { from: string; to: string } | null;
  /** Records whose day of the operation is not the day they were sent. */
  late: number;
  users: number;
  totals: Tally & { kept: number };
  /** The goal: automatic capture only. */
  goal: Tally;
  /** The goal among records two days old or more — they had time to be corrected. */
  goalAged: Tally;
  manual: Tally;
  /** Neither automatic nor manual: no source, a receipt, an unknown one. */
  others: Tally;
  sources: SourceTally[];
  corrections: {
    kept: number;
    edited: number;
    category: number;
    amount: number;
    type: number;
    other: number;
    botAccount: number;
    botDate: number;
    categorySnapshot: number;
    amountSnapshot: number;
    withoutParse: number;
  };
  flags: { flagged: number; untouched: number; standing: number; deleted: number };
  guess: { botRecords: number; still: number; stillUntouched: number };
  applePay: { payments: number; unmatched: number; currencyMismatch: number; editedUnflagged: number };
}

const changedByParse = (row: CaptureRow) => row.categoryChanged || row.amountChanged || row.typeChanged;
const isEdited = (row: CaptureRow) => !row.deleted && (row.touched || changedByParse(row));
/** Nothing changed after it was written: not deleted, not touched, the snapshot as the record. */
const isUntouched = (row: CaptureRow) => !row.deleted && !row.touched && !changedByParse(row);
const isWaiting = (row: CaptureRow) => !row.deleted && (row.flaggedNow || row.botGuessed);
const isClean = (row: CaptureRow) => isUntouched(row) && !isWaiting(row);
const isTouchedWithoutSnapshot = (row: CaptureRow) =>
  !row.deleted && row.touched && !changedByParse(row) && !isWaiting(row);
const isAutomatic = (row: CaptureRow) => row.source !== null && AUTOMATIC_SOURCES.has(row.source);
const count = (rows: readonly CaptureRow[], test: (row: CaptureRow) => boolean) => rows.filter(test).length;

/** The report's source of a record; a bot record is a voice or a text by the bot message that shows it. */
export function sourceKeyOf(row: CaptureRow): string {
  switch (row.source) {
    case 'telegram':
      if (row.botVoice === null) return 'bot_unshown';
      return row.botVoice ? 'bot_voice' : 'bot_text';
    case 'ios_shortcut':
      return 'ios';
    case 'apple_pay':
    case 'miniapp':
    case 'manual':
    case 'receipt':
      return row.source;
    case null:
      return 'none';
    default:
      return `other:${row.source}`;
  }
}

export function tally(rows: readonly CaptureRow[]): Tally {
  const clean = count(rows, isClean);
  return {
    captured: rows.length,
    edited: count(rows, isEdited),
    deleted: count(rows, row => row.deleted),
    waiting: count(rows, isWaiting),
    clean,
    cleanAtMost: clean + count(rows, isTouchedWithoutSnapshot),
  };
}

function sourcesOf(rows: readonly CaptureRow[]): SourceTally[] {
  const known = SOURCES.map(spec => ({ spec, rows: rows.filter(row => sourceKeyOf(row) === spec.key) }));
  const otherKeys = [...new Set(rows.map(sourceKeyOf).filter(key => key.startsWith('other:')))].sort();
  const others = otherKeys.map(key => ({
    spec: { key, label: key.slice('other:'.length).slice(0, 30), always: false },
    rows: rows.filter(row => sourceKeyOf(row) === key),
  }));
  return [...known, ...others]
    .filter(({ spec, rows: ofSource }) => spec.always || ofSource.length > 0)
    .map(({ spec, rows: ofSource }) => ({ key: spec.key, label: spec.label, ...tally(ofSource) }));
}

/** Days with records that stayed, up to today, by the given day of a record. */
function calendarOf(rows: readonly CaptureRow[], dayOf: (row: CaptureRow) => string, from: string, to: string, today: string): Calendar {
  const counted = daysBetween(from, to < today ? to : today);
  const days = counted.map(day => ({
    day,
    kept: count(rows, row => dayOf(row) === day && !row.deleted),
    deleted: count(rows, row => dayOf(row) === day && row.deleted),
  }));
  const recorded = new Set(days.filter(day => day.kept > 0).map(day => day.day));
  const streaks = streaksOf(counted, recorded, today);
  const daysWithout = days
    .filter(day => day.kept === 0 && !(streaks.todayPending && day.day === today))
    .map(day => day.day);
  return { days, daysWithout, streaks };
}

function futureOf(from: string, to: string, today: string): QualityReport['future'] {
  const dayAfterToday = new Date(Date.parse(`${today}T00:00:00Z`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const days = daysBetween(from > today ? from : dayAfterToday, to);
  return days.length > 0 ? { from: days[0], to: days[days.length - 1] } : null;
}

function correctionsOf(rows: readonly CaptureRow[]): QualityReport['corrections'] {
  const kept = rows.filter(row => !row.deleted);
  return {
    kept: kept.length,
    edited: count(kept, isEdited),
    category: count(kept, row => row.categoryChanged),
    amount: count(kept, row => row.amountChanged),
    type: count(kept, row => row.typeChanged),
    other: count(kept, row => isEdited(row) && !changedByParse(row)),
    botAccount: count(kept, row => row.botLastAccount),
    botDate: count(kept, row => row.botLastDate),
    categorySnapshot: count(kept, row => row.categorySnapshot),
    amountSnapshot: count(kept, row => row.amountSnapshot),
    withoutParse: count(kept, row => !row.hasParse),
  };
}

function flagsOf(rows: readonly CaptureRow[]): QualityReport['flags'] {
  const flagged = rows.filter(row => row.flaggedByParse || row.flaggedNow);
  return {
    flagged: flagged.length,
    untouched: count(flagged, isUntouched),
    standing: count(flagged, row => row.flaggedNow && !row.deleted),
    deleted: count(flagged, row => row.deleted),
  };
}

function guessOf(rows: readonly CaptureRow[]): QualityReport['guess'] {
  const bot = rows.filter(row => row.source === 'telegram' && !row.deleted);
  const still = bot.filter(row => row.botGuessed);
  return { botRecords: bot.length, still: still.length, stillUntouched: count(still, isUntouched) };
}

/**
 * Apple Pay without a matched card: the payment went to the default account and is flagged «Нужно проверить»
 * (`reviewUnlessNamed`, FT-176). Only the flag tells it apart from a matched one, so a payment whose flag was taken off
 * is not seen here: those are among the payments edited after capture. A payment whose currency is not its account's
 * is flagged for that too, card matched or not: it is counted on its own line, not as an unmatched card.
 */
function applePayOf(rows: readonly CaptureRow[]): QualityReport['applePay'] {
  const payments = rows.filter(row => row.source === 'apple_pay');
  return {
    payments: payments.length,
    unmatched: count(payments, row => row.flaggedNow && !row.currencyMismatch),
    currencyMismatch: count(payments, row => row.currencyMismatch),
    editedUnflagged: count(payments, row => !row.flaggedNow && isEdited(row)),
  };
}

export function summarize(
  read: { rows: readonly CaptureRow[]; lastRecordAt: string | null },
  period: { from: string; to: string },
  today: string
): QualityReport {
  const { from, to } = period;
  const inPeriod = (day: string) => day >= from && day <= to;
  const rows = read.rows.filter(row => inPeriod(row.day));
  const sentRows = read.rows.filter(row => inPeriod(row.sentDay));
  const automatic = rows.filter(isAutomatic);
  const totals = tally(rows);
  return {
    from,
    to,
    today,
    lastRecordAt: read.lastRecordAt,
    calendar: calendarOf(rows, row => row.day, from, to, today),
    sentCalendar: calendarOf(sentRows, row => row.sentDay, from, to, today),
    future: futureOf(from, to, today),
    late: count(rows, row => row.day !== row.sentDay),
    users: new Set(rows.map(row => row.userId)).size,
    totals: { ...totals, kept: totals.captured - totals.deleted },
    goal: tally(automatic),
    goalAged: tally(automatic.filter(row => row.aged)),
    manual: tally(rows.filter(row => row.source === 'manual')),
    others: tally(rows.filter(row => !isAutomatic(row) && row.source !== 'manual')),
    sources: sourcesOf(rows),
    corrections: correctionsOf(rows),
    flags: flagsOf(rows),
    guess: guessOf(rows),
    applePay: applePayOf(rows),
  };
}
