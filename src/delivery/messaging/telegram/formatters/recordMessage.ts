import { TransactionSemanticType } from '../../../../modules/transaction/domain/transactionSemanticType';
import { RecordMessageMode, RecordMessageState } from '../../../../modules/botMessage/domain/botMessage';
import { ItemWithoutAmount } from '../../../../modules/voiceProcessing/domain/processedTransaction';

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
  /** The category is «Другое»: a guess there is «Категорию не узнал» (FT-123). */
  categoryIsOther?: boolean;
  /** The starter key of the category, for the large-amount rule (FT-123); null for one of the user's own. */
  categoryPresetKey?: string | null;
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
  /** The records the message shows, in its order — without the ones declined. */
  records: RecordView[];
  /** Records of a large amount the person chose not to write (FT-123): deleted, said in a line. */
  declined?: RecordView[];
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

/**
 * «Транспорт · «Такси»», «Покупки? · «Uzum»». A guessed «Другое» of a single record goes without «?»: the
 * line under it says «Категорию не узнал» (FT-123, board «Бот · когда ИИ не уверен»).
 */
function what(record: RecordView, state: RecordMessageState, unknownSaid = false): string {
  const note = shownNote(record);
  const category = `${record.categoryName}${guessed(record, state) && !unknownSaid ? '?' : ''}`;
  return note ? `${category} · ${quoted(note)}` : category;
}

/** «Наличные · 14 октября». */
function where(record: RecordView, today: string): string {
  return [record.accountName, absoluteDate(record.date, today)].filter(Boolean).join(' · ');
}

export function isEditing(mode: RecordMessageMode): boolean {
  return mode !== 'confirm' && mode !== 'large';
}

/** «Такси»: an item named without an amount, as the bot names it (FT-123). */
export function itemName(item: Pick<ItemWithoutAmount, 'description'>): string {
  const name = item.description.trim().replace(/\s+/g, ' ');
  const cut = name.length > NOTE_MAX_LENGTH ? `${name.slice(0, NOTE_MAX_LENGTH - 1).trim()}…` : name;
  return capitalize(cut);
}

/**
 * «45» read as 45 000 (FT-123): what was written, while the record still has that amount — a later change of
 * the amount, in the chat or in the app, makes it no longer an assumption.
 */
export function assumedWritten(record: RecordView, state: RecordMessageState): string | undefined {
  const assumed = state.assumed?.[record.id];
  return assumed && !record.cancelled && assumed.amountMinor === record.amountMinor ? assumed.written : undefined;
}

/** The single record's category question (FT-123): «верно?» for a guess, «не узнал» for a guess of «Другое». */
export function categoryQuestion(input: Pick<RecordMessageInput, 'records' | 'mode' | 'state'>): 'guess' | 'unknown' | undefined {
  const [record, ...others] = input.records;
  if (!record || others.length > 0 || record.cancelled || input.mode !== 'confirm' || !input.state.guessed.includes(record.id)) return undefined;
  return record.categoryIsOther ? 'unknown' : 'guess';
}

/** The amount as the person would type it in «не …, а …»: «145 000», «55» or «55,50» for dollars. */
function typedAmount(record: Pick<RecordView, 'amountMinor' | 'currency'>): string {
  if (record.currency === 'USD' && Math.abs(record.amountMinor) % 100 === 0) return groupDigits(String(Math.abs(record.amountMinor) / 100));
  return amountDigits(record.amountMinor, record.currency);
}

/** «Это 25 000 сум» of a large amount: what it most likely was, a thousand times less (FT-123). */
export function thousandTimesLess(record: Pick<RecordView, 'amountMinor'>): number {
  return Math.round(record.amountMinor / 100 / 1000) * 100;
}

/** The record the large-amount question is about. */
export function largeRecord(input: Pick<RecordMessageInput, 'records' | 'state'>): RecordView | undefined {
  return input.records[input.state.large?.index ?? 0];
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
      lines.push({ text: several ? `${prefix}нужно проверить в Kapelka.` : 'Нужно проверить в Kapelka — пока не входит в итоги.' });
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
        text: input.records.length > 1
          ? `Меняем ${quoted(recordName(record))}. Что именно?`
          : `Что изменить? Сумму можно и текстом: «не ${typedAmount(record)}, а …».`,
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

function joined(lines: Line[]): string {
  return lines.map((line, index) => `${index > 0 ? (line.gap ? '\n\n' : '\n') : ''}${render(line)}`).join('');
}

/** «Сумма большая: −25 000 000 сум за «Кофе».» (FT-123). */
function largeTitle(record: RecordView): string {
  return `Сумма большая: ${signedAmount(record)} за ${quoted(recordName(record))}.`;
}

/** The large-amount question: nothing of the message is written until it is answered (FT-123). */
function formatLargeQuestion(input: RecordMessageInput): string {
  const record = largeRecord(input);
  if (!record) return '';
  const lines: Line[] = [
    { text: largeTitle(record), bold: true },
    { text: input.records.length > 1 ? 'Пока ничего из сообщения не записал — сумма верная?' : 'Пока не записал — сумма верная?' },
    ...(input.state.notes ?? []).map(text => ({ text })),
  ];
  if (!input.state.large?.replyClosed) lines.push({ text: 'Если сумма другая — напишите её.', italic: true, gap: true });
  return joined(lines);
}

/** «Не записывать» of a large amount: the message keeps it struck through, nothing else (FT-123). */
function formatDeclined(declined: RecordView[]): string {
  return joined([
    ...declined.map(record => ({ text: largeTitle(record), bold: true, struck: true })),
    { text: 'Не записал.', gap: true },
  ]);
}

/** Lines about what the message did not write: no amount, skipped, a large amount declined (FT-123). */
function notWritten(input: RecordMessageInput): Line[] {
  const texts = [
    ...(input.state.notes ?? []),
    ...(input.declined ?? []).map(record => `${quoted(recordName(record))} на ${signedAmount(record)} не записал.`),
  ];
  return texts.map((text, index) => ({ text, gap: index === 0 && input.records.length > 0 }));
}

/** «Сколько?» of the first item named without an amount (FT-123). */
function missingQuestion(input: RecordMessageInput): Line[] {
  const [item] = input.state.missing ?? [];
  if (!item) return [];
  const name = quoted(itemName(item));
  if (input.records.length === 0) return [{ text: `${name} — без суммы.`, bold: true }, { text: 'Сколько? Напишите числом.' }];
  return [{ text: `${name} — без суммы. Сколько? Напишите числом.`, gap: true }];
}

/** The message text in Telegram HTML. */
export function formatRecordMessage(input: RecordMessageInput): string {
  const { records, state, today } = input;
  if (input.mode === 'large' && records.length > 0) return formatLargeQuestion(input);
  if (records.length === 0 && (input.declined?.length ?? 0) > 0 && !state.missing?.length) return formatDeclined(input.declined!);

  const allCancelled = records.length > 0 && records.every(record => record.cancelled);
  const lines: Line[] = [];

  if (records.length === 1) {
    const [record] = records;
    const struck = record.cancelled;
    const written = assumedWritten(record, state);
    lines.push({ text: `${record.type === 'income' ? 'Доход' : 'Расход'} ${signedAmount(record)}`, bold: true, struck });
    // The assumption goes right under the amount it is about
    if (written) lines.push({ text: `${quoted(written)} понял как ${amountWithUnit(record.amountMinor, record.currency)}.`, italic: true });
    lines.push({ text: what(record, state, categoryQuestion(input) === 'unknown'), struck });
    lines.push({ text: where(record, today), struck });
  } else if (records.length > 1) {
    const editing = isEditing(input.mode);
    const sameWhere = records.every(record => record.accountName === records[0].accountName && record.date === records[0].date);
    lines.push({ text: headerOfSeveral(records), bold: true, struck: allCancelled });
    records.forEach((record, index) => {
      const written = assumedWritten(record, state);
      const parts = [`${shortAmount(record)}${written ? '?' : ''}`, what(record, state)];
      if (!sameWhere) parts.push(where(record, today));
      lines.push({ text: parts.join(' · '), struck: record.cancelled, bold: editing && index === state.selected });
      if (written) lines.push({ text: `${quoted(written)} понял как ${amountWithUnit(record.amountMinor, record.currency)}.`, italic: true });
    });
    if (sameWhere) lines.push({ text: where(records[0], today), struck: allCancelled });
  }

  lines.push(...notices(records));

  // Telegram draws a quote upright; on the boards it is italic
  if (input.heard && !allCancelled) lines.push({ text: `Расслышал: ${quoted(input.heard)}`, italic: true, quote: true });

  if (allCancelled) {
    lines.push({ text: records.length > 1 ? 'Отменено — в приложении этих записей нет.' : 'Отменено — в приложении этой записи нет.', gap: true });
  } else if (state.changed && input.mode === 'confirm') {
    lines.push({ text: `${state.changed}.`, italic: true, gap: true });
  }

  const asked = categoryQuestion(input);
  if (asked === 'guess') lines.push({ text: `Записал в ${quoted(records[0].categoryName)} — верно?`, gap: true });
  if (asked === 'unknown') lines.push({ text: `Категорию не узнал — записал в ${quoted(records[0].categoryName)}.`, gap: true });

  lines.push(...notWritten(input));

  const question = allCancelled ? undefined : prompt(input);
  if (question) lines.push(question);

  if (!allCancelled) lines.push(...missingQuestion(input));
  if (lines.length === 0) lines.push({ text: 'Хорошо, не записываю.' });

  return joined(lines);
}
