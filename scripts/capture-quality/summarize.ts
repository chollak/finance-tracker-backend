import { CaptureRow } from './readCaptures';
import { daysBetween, Streaks, streaksOf } from './period';

/**
 * The numbers of the capture quality report (FT-217), from the records of a period. Pure: rows in, counts out.
 *
 * - A record is **without a correction** when it is not deleted, `updatedAt` equals `createdAt` and what the parse
 *   wrote (`originalParsing`) is what the record holds now.
 * - **Deleted records count**: in the total and as corrected. A record deleted after it was written is a capture that
 *   went wrong — misheard, a duplicate, a large amount declined — so leaving it out would flatter the result. Days and
 *   runs of days count only the records that stayed: a day whose only record was deleted has no records.
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

export interface Tally {
  captured: number;
  /** Kept and changed after it was written. */
  edited: number;
  deleted: number;
  clean: number;
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

export interface QualityReport {
  from: string;
  to: string;
  today: string;
  /** The days counted: the period up to today. */
  days: DayTally[];
  /** The part of the period after today, if any: not counted. */
  future: { from: string; to: string } | null;
  daysWithout: string[];
  streaks: Streaks;
  users: number;
  totals: Tally & { kept: number };
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
const isClean = (row: CaptureRow) => !row.deleted && !row.touched && !changedByParse(row);
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

function tally(rows: readonly CaptureRow[]): Tally {
  return {
    captured: rows.length,
    edited: count(rows, isEdited),
    deleted: count(rows, row => row.deleted),
    clean: count(rows, isClean),
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

function daysOf(rows: readonly CaptureRow[], from: string, to: string, today: string) {
  const lastCounted = to < today ? to : today;
  const counted = daysBetween(from, lastCounted);
  const days = counted.map(day => ({
    day,
    kept: count(rows, row => row.day === day && !row.deleted),
    deleted: count(rows, row => row.day === day && row.deleted),
  }));
  const recorded = new Set(days.filter(day => day.kept > 0).map(day => day.day));
  const streaks = streaksOf(counted, recorded, today);
  const daysWithout = days
    .filter(day => day.kept === 0 && !(streaks.todayPending && day.day === today))
    .map(day => day.day);
  const futureDays = daysBetween(from > today ? from : daysAfter(today), to);
  const future = futureDays.length > 0 ? { from: futureDays[0], to: futureDays[futureDays.length - 1] } : null;
  return { days, daysWithout, streaks, future };
}

function daysAfter(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
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
    untouched: count(flagged, isClean),
    standing: count(flagged, row => row.flaggedNow && !row.deleted),
    deleted: count(flagged, row => row.deleted),
  };
}

function guessOf(rows: readonly CaptureRow[]): QualityReport['guess'] {
  const bot = rows.filter(row => row.source === 'telegram' && !row.deleted);
  const still = bot.filter(row => row.botGuessed);
  return { botRecords: bot.length, still: still.length, stillUntouched: count(still, isClean) };
}

/**
 * Apple Pay without a matched card: the payment went to the default account and is flagged «Нужно проверить»
 * (`reviewUnlessNamed`, FT-176). Only the flag tells it apart from a matched one, so a payment whose flag was taken off
 * is not seen here: those are among the payments edited after capture.
 */
function applePayOf(rows: readonly CaptureRow[]): QualityReport['applePay'] {
  const payments = rows.filter(row => row.source === 'apple_pay');
  const unmatched = payments.filter(row => row.flaggedNow);
  return {
    payments: payments.length,
    unmatched: unmatched.length,
    currencyMismatch: count(unmatched, row => row.currencyMismatch),
    editedUnflagged: count(payments, row => !row.flaggedNow && isEdited(row)),
  };
}

export function summarize(rows: readonly CaptureRow[], period: { from: string; to: string }, today: string): QualityReport {
  const totals = tally(rows);
  return {
    from: period.from,
    to: period.to,
    today,
    ...daysOf(rows, period.from, period.to, today),
    users: new Set(rows.map(row => row.userId)).size,
    totals: { ...totals, kept: totals.captured - totals.deleted },
    sources: sourcesOf(rows),
    corrections: correctionsOf(rows),
    flags: flagsOf(rows),
    guess: guessOf(rows),
    applePay: applePayOf(rows),
  };
}
