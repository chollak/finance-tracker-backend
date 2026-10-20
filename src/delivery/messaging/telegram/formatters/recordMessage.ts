import { TransactionSemanticType } from '../../../../modules/transaction/domain/transactionSemanticType';
import { RecordMessageMode, RecordMessageState } from '../../../../modules/botMessage/domain/botMessage';

/**
 * The bot's message about records (FT-122, docs/pastel/components/BotRecord.md). Telegram draws it, so
 * only bold, italics, strike-through, a quote and empty lines are available; no emoji.
 *
 *   Расход −24 000 сум            ← bold
 *   Транспорт · «Такси»           ← category and note
 *   Наличные · 14 октября         ← account and an absolute date
 */

export const NBSP = ' ';
export const MINUS = '−';

export interface RecordView {
  id: string;
  type: 'income' | 'expense';
  semanticType: TransactionSemanticType;
  amountMinor: number;
  currency: 'UZS' | 'USD';
  categoryId?: string;
  /** The current name of the record's category. */
  categoryName: string;
  /** The record's note (description, else merchant), as written. */
  note: string;
  accountId?: string;
  /** Unknown without the account module: the line then has the date only. */
  accountName?: string;
  /** YYYY-MM-DD. */
  date: string;
  needsReview: boolean;
  /** Deleted (softly) — by «Отменить», /undo or in the app. */
  cancelled: boolean;
}

export interface PickerCategory {
  id: string;
  name: string;
  type: 'income' | 'expense';
}

export interface PickerAccount {
  id: string;
  name: string;
  currency: 'UZS' | 'USD';
}

export interface RecordMessageInput {
  records: RecordView[];
  mode: RecordMessageMode;
  state: RecordMessageState;
  heard?: string | null;
  /** Today in the user's time zone, YYYY-MM-DD: the date buttons and the year of a date. */
  today: string;
  /** The user's visible categories, in their order. */
  categories: PickerCategory[];
  /** The user's visible accounts, in their order. */
  accounts: PickerAccount[];
  /** The Mini App with the record's sheet open; undefined when the Mini App is not configured. */
  recordUrl?: (recordId: string) => string | undefined;
  /** History in the Mini App, for a message with more records than buttons. */
  historyUrl?: string;
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const NOTE_MAX_LENGTH = 40;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** «1 запись», «2 записи», «5 записей». */
export function recordsWord(n: number): string {
  return `${n} ${plural(n, 'запись', 'записи', 'записей')}`;
}

function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** «24 000» for сум, «55,00» for dollars: digits grouped by a non-breaking space. */
export function amountDigits(minor: number, currency: 'UZS' | 'USD'): string {
  const abs = Math.abs(Math.round(minor));
  if (currency === 'UZS') return groupDigits(String(Math.round(abs / 100)));
  return `${groupDigits(String(Math.floor(abs / 100)))},${String(abs % 100).padStart(2, '0')}`;
}

/** «24 000 сум», «55,00 USD». */
export function amountWithUnit(minor: number, currency: 'UZS' | 'USD'): string {
  return `${amountDigits(minor, currency)}${NBSP}${currency === 'UZS' ? 'сум' : 'USD'}`;
}

function sign(record: Pick<RecordView, 'type'>): string {
  return record.type === 'income' ? '+' : MINUS;
}

/** «−24 000 сум», «+3 200 000 сум». */
export function signedAmount(record: Pick<RecordView, 'type' | 'amountMinor' | 'currency'>): string {
  return `${sign(record)}${amountWithUnit(record.amountMinor, record.currency)}`;
}

/** The amount in a line of several records and on its button: «−25 000»; dollars keep the unit. */
export function shortAmount(record: Pick<RecordView, 'type' | 'amountMinor' | 'currency'>): string {
  return record.currency === 'USD' ? signedAmount(record) : `${sign(record)}${amountDigits(record.amountMinor, record.currency)}`;
}

/** «14 октября»; a date of another year than today's gets its year: «31 декабря 2025». */
export function absoluteDate(date: string, today: string): string {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  const label = `${day}${NBSP}${MONTHS[month - 1]}`;
  return today.slice(0, 4) === String(year) ? label : `${label} ${year}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('ru-RU') + text.slice(1);
}

function sameWords(a: string, b: string): boolean {
  const key = (text: string) => text.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  return key(a) === key(b);
}

/** The note as shown: capitalised and cut to 40 characters; empty when it only repeats the category. */
export function shownNote(record: Pick<RecordView, 'note' | 'categoryName'>): string {
  const note = record.note.trim().replace(/\s+/g, ' ');
  if (!note || sameWords(note, record.categoryName)) return '';
  const cut = note.length > NOTE_MAX_LENGTH ? `${note.slice(0, NOTE_MAX_LENGTH - 1).trim()}…` : note;
  return capitalize(cut);
}

/** What a record is called in the bot's sentences and buttons: its note, else its category. */
export function recordName(record: Pick<RecordView, 'note' | 'categoryName'>): string {
  return shownNote(record) || record.categoryName;
}

export function quoted(text: string): string {
  return `«${text}»`;
}

function guessed(record: RecordView, state: RecordMessageState): boolean {
  return state.guessed.includes(record.id);
}

/** «Транспорт · «Такси»», «Покупки? · «Uzum»». */
function what(record: RecordView, state: RecordMessageState): string {
  const note = shownNote(record);
  const category = `${record.categoryName}${guessed(record, state) ? '?' : ''}`;
  return note ? `${category} · ${quoted(note)}` : category;
}

/** «Наличные · 14 октября». */
function where(record: RecordView, today: string): string {
  return [record.accountName, absoluteDate(record.date, today)].filter(Boolean).join(' · ');
}

export function isEditing(mode: RecordMessageMode): boolean {
  return mode !== 'confirm';
}

/** The record a press changes: the one picked among several, else the only one. */
export function selectedRecord(input: Pick<RecordMessageInput, 'records' | 'state'>): RecordView | undefined {
  return input.records[input.state.selected] ?? input.records[0];
}

interface Line {
  text: string;
  bold?: boolean;
  italic?: boolean;
  struck?: boolean;
  /** An empty line before it. */
  gap?: boolean;
  quote?: boolean;
}

function render(line: Line): string {
  let text = escapeHtml(line.text);
  if (line.bold) text = `<b>${text}</b>`;
  if (line.italic) text = `<i>${text}</i>`;
  if (line.struck) text = `<s>${text}</s>`;
  if (line.quote) text = `<blockquote>${text}</blockquote>`;
  return text;
}

function headerOfSeveral(records: RecordView[]): string {
  const live = records.filter(record => !record.cancelled);
  const counted = live.length > 0 ? live : records;
  const count = recordsWord(counted.length);
  const sameKind = live.length > 0
    && live.every(record => record.type === live[0].type && record.currency === live[0].currency);
  if (!sameKind) return count;
  const total = live.reduce((sum, record) => sum + record.amountMinor, 0);
  const title = live[0].type === 'income' ? 'Доходы' : 'Расходы';
  return `${title} ${signedAmount({ ...live[0], amountMinor: total })} · ${count}`;
}

/** Lines that keep a record from being read as ordinary spending: transfers, records to check. */
function notices(records: RecordView[]): Line[] {
  const several = records.length > 1;
  const lines: Line[] = [];
  for (const record of records.filter(candidate => !candidate.cancelled)) {
    const prefix = several ? `${quoted(recordName(record))} — ` : '';
    if (record.type === 'expense' && record.semanticType !== 'expense') {
      lines.push({ text: several ? `${prefix}не входит в расходы.` : 'Не входит в расходы.' });
    }
    if (record.needsReview) {
      lines.push({ text: several ? `${prefix}нужно проверить в Daftar.` : 'Нужно проверить в Daftar — пока не входит в итоги.' });
    }
  }
  return lines;
}

function prompt(input: RecordMessageInput): Line | undefined {
  const record = selectedRecord(input);
  if (!record) return undefined;
  switch (input.mode) {
    case 'edit':
      return {
        text: input.records.length > 1 ? `Меняем ${quoted(recordName(record))}. Что именно?` : 'Что изменить?',
        italic: true,
        gap: true,
      };
    case 'category': {
      const pickType = input.state.pickType;
      const switched = pickType && pickType !== record.type;
      return {
        text: switched ? `Выберите категорию ${pickType === 'income' ? 'дохода' : 'расхода'}:` : 'Выберите категорию:',
        italic: true,
        gap: true,
      };
    }
    case 'account':
      return { text: 'Выберите счёт:', italic: true, gap: true };
    case 'date':
      return { text: 'Когда это было?', italic: true, gap: true };
    case 'amount':
      return { text: `Напишите новую сумму — например, ${record.currency === 'USD' ? '60$' : '150к'}.`, bold: true, gap: true };
    default:
      return undefined;
  }
}

/** The message text in Telegram HTML. */
export function formatRecordMessage(input: RecordMessageInput): string {
  const { records, state, today } = input;
  const allCancelled = records.length > 0 && records.every(record => record.cancelled);
  const lines: Line[] = [];

  if (records.length === 1) {
    const [record] = records;
    const struck = record.cancelled;
    lines.push({ text: `${record.type === 'income' ? 'Доход' : 'Расход'} ${signedAmount(record)}`, bold: true, struck });
    lines.push({ text: what(record, state), struck });
    lines.push({ text: where(record, today), struck });
  } else if (records.length > 1) {
    const editing = isEditing(input.mode);
    const sameWhere = records.every(record => record.accountName === records[0].accountName && record.date === records[0].date);
    lines.push({ text: headerOfSeveral(records), bold: true, struck: allCancelled });
    records.forEach((record, index) => {
      const parts = [shortAmount(record), what(record, state)];
      if (!sameWhere) parts.push(where(record, today));
      lines.push({ text: parts.join(' · '), struck: record.cancelled, bold: editing && index === state.selected });
    });
    if (sameWhere) lines.push({ text: where(records[0], today), struck: allCancelled });
  }

  lines.push(...notices(records));

  if (input.heard && !allCancelled) lines.push({ text: `Расслышал: ${quoted(input.heard)}`, quote: true });

  if (allCancelled) {
    lines.push({ text: records.length > 1 ? 'Отменено — в приложении этих записей нет.' : 'Отменено — в приложении этой записи нет.', gap: true });
  } else if (state.changed && input.mode === 'confirm') {
    lines.push({ text: `${state.changed}.`, italic: true, gap: true });
  }

  const question = allCancelled ? undefined : prompt(input);
  if (question) lines.push(question);

  return lines.map((line, index) => `${index > 0 ? (line.gap ? '\n\n' : '\n') : ''}${render(line)}`).join('');
}
