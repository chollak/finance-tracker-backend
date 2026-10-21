import { visibleAccounts, type Account } from '@/entities/account';
import { pickableCategories, type Category } from '@/entities/category';
import type { QueuedRecordInput } from '@/entities/transaction';
import type { LocalDate } from '@/shared/lib/dates';
import type { Currency } from '@/shared/lib/money';

/**
 * Reading a phrase on the device without a connection (FT-129, OfflineBar.md, board «Главная без связи»). Only a
 * simple «what and how much», the way the bot reads an amount (FT-122): «такси 18к, кофе 25к» — two records; «55$» —
 * dollars; «45» without «к» — 45 000 with «проверьте сумму». The category comes from the first word by the starter
 * categories; anything else goes to «Другое». Anything more (two amounts in one part, no amount) is not read: the
 * phrase waits in the field for the connection.
 */

export interface OfflineItem {
  type: 'expense' | 'income';
  /** Integer minor units of `currency`. */
  amountMinor: number;
  currency: Currency;
  /** The words around the amount, first letter capitalised; empty when there are none. */
  note: string;
  /** The starter category its first word names (`cafe`, `transport`…); null when it names none. */
  presetKey: string | null;
  /** «45» was read as 45 000. */
  checkAmount: boolean;
}

/** The first word of a part → its starter category (the board's list). */
const EXPENSE_WORDS: ReadonlyArray<readonly [string, string]> = [
  ['кофе', 'cafe'],
  ['обед', 'cafe'],
  ['ужин', 'cafe'],
  ['кафе', 'cafe'],
  ['такси', 'transport'],
  ['метро', 'transport'],
  ['бензин', 'transport'],
  ['продукт', 'groceries'],
  ['рынок', 'groceries'],
  ['супермаркет', 'groceries'],
  ['аптек', 'health'],
  ['связь', 'telecom'],
  ['телефон', 'telecom'],
];
const INCOME_WORDS: ReadonlyArray<readonly [string, string]> = [['зарплат', 'salary']];
/** A part that starts with one of these is an income. */
const INCOME_START = /^(зарплат|пришл|получил|доход|аванс)/;

const LETTER = '[a-zа-яё]';
const MAGNITUDE = `(?:(млн|миллион${LETTER}*|тысяч${LETTER}*|тыщ${LETTER}*|тыс\\.?|к|k)(?!${LETTER}))?`;
const UNIT = `(?:(\\$|usd|долл${LETTER}*|сум|сумов|сума|so'?m|uzs)(?!${LETTER}))?`;
/** «$45», «45», «45 000», «1,5 млн», «18 тысяч», «45к», «55$», «4 usd», «45 000 сум». */
const AMOUNT = new RegExp(`(\\$\\s*)?(\\d[\\d\\s]*(?:[.,]\\d+)*)\\s*${MAGNITUDE}\\s*${UNIT}`);

const FACTORS: ReadonlyArray<readonly [RegExp, number]> = [
  [/^(млн|миллион)/, 1_000_000],
  [/^(тыс|тыщ|к|k)/, 1_000],
];
/** A bare amount under this in сум is thousands, as the bot reads it. */
const SHORTENED_BELOW = 1000;
const MAX_MINOR = Number.MAX_SAFE_INTEGER;

/** «150 000», «150.000» and «150,000» are thousands groups; «1,5» and «9.99» are fractions. */
function readNumber(raw: string, hasMagnitude: boolean): number | null {
  const compact = raw.replace(/\s/g, '');
  if (/^\d+$/.test(compact)) return Number(compact);
  if (!hasMagnitude && /^\d{1,3}(?:[.,]\d{3})+$/.test(compact)) return Number(compact.replace(/[.,]/g, ''));
  if (/^\d+[.,]\d+$/.test(compact)) return Number(compact.replace(',', '.'));
  return null;
}

function presetOf(word: string, type: OfflineItem['type']): string | null {
  const words = type === 'income' ? INCOME_WORDS : EXPENSE_WORDS;
  return words.find(([start]) => word.startsWith(start))?.[1] ?? null;
}

function readPart(part: string): OfflineItem | null {
  const text = part.toLocaleLowerCase('ru-RU').trim();
  const match = AMOUNT.exec(text);
  if (!match) return null;
  const [found, dollarBefore, rawNumber, magnitude, unit] = match;

  const value = readNumber(rawNumber, Boolean(magnitude));
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  const dollars = Boolean(dollarBefore) || (unit !== undefined && /^(\$|usd|долл)/.test(unit));
  const sumUnit = unit !== undefined && !dollars;

  let major = value * (FACTORS.find(([pattern]) => magnitude && pattern.test(magnitude))?.[1] ?? 1);
  let checkAmount = false;
  if (!dollars && !magnitude && !sumUnit && value < SHORTENED_BELOW) {
    major = value * 1000;
    checkAmount = true;
  }
  const amountMinor = dollars ? Math.round(major * 100) : Math.round(major) * 100;
  if (amountMinor <= 0 || amountMinor > MAX_MINOR) return null;

  const rest = (text.slice(0, match.index) + ' ' + text.slice(match.index + found.length))
    .replace(/[.!?:—–-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Two amounts in one part («кофе 25к такси 18к»): not a simple «what and how much»
  if (/\d/.test(rest)) return null;

  const word = rest.split(' ')[0] ?? '';
  const type = INCOME_START.test(word) ? 'income' : 'expense';
  // The note as written, with its first letter capitalised
  const original = part.trim();
  const note = rest ? noteFrom(original, rest) : '';
  return { type, amountMinor, currency: dollars ? 'USD' : 'UZS', note, presetKey: presetOf(word, type), checkAmount };
}

/** The words of the note with the case the user typed them in, the first letter capitalised. */
function noteFrom(original: string, restLower: string): string {
  const lowerOriginal = original.toLocaleLowerCase('ru-RU');
  const at = lowerOriginal.indexOf(restLower);
  const kept = at >= 0 ? original.slice(at, at + restLower.length) : restLower;
  return kept.charAt(0).toLocaleUpperCase('ru-RU') + kept.slice(1);
}

/** The records of a phrase, or null when any part of it is not a simple «what and how much». */
export function parseOfflineText(text: string): OfflineItem[] | null {
  // «9,99$» and «1,5 млн» keep their comma; a comma between parts separates them
  const parts = text
    .replace(/(\d),(\d)/g, '$1.$2')
    .split(/[,;\n]|\sи\s/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const items = parts.map(readPart);
  return items.every((item): item is OfflineItem => item !== null) ? items : null;
}

export interface OfflineRecordsContext {
  /** The user's categories as last read (empty when they never were on this device). */
  categories: readonly Category[];
  /** Every account as last read (empty when they never were). */
  accounts: readonly Account[];
  defaultAccountId: string | null | undefined;
  today: LocalDate;
}

export type OfflineRecordsResult =
  | { ok: true; records: QueuedRecordInput[] }
  /** «55$» and no visible dollar account: the server would refuse it later. */
  | { ok: false; reason: 'no-dollar-account' };

function categoryFor(item: OfflineItem, categories: readonly Category[]): Pick<QueuedRecordInput, 'categoryId' | 'categoryName'> {
  // Never read here: the server resolves the word (an old name or synonym, else «Другое»)
  if (categories.length === 0) return { categoryName: item.note || 'Другое' };
  const offered = pickableCategories(categories, item.type);
  const category =
    (item.presetKey ? offered.find((candidate) => candidate.presetKey === item.presetKey) : undefined) ??
    offered.find((candidate) => candidate.isOther) ??
    categories.find((candidate) => candidate.type === item.type && candidate.isOther);
  return category ? { categoryId: category.id, categoryName: category.name } : { categoryName: 'Другое' };
}

/** The account a record goes to, as the server would pick it: the default one of its currency, else the first. */
function accountFor(item: OfflineItem, accounts: readonly Account[], defaultAccountId: string | null | undefined): Account | null | undefined {
  if (accounts.length === 0) return undefined;
  const ofCurrency = visibleAccounts(accounts).filter((account) => account.currency === item.currency);
  return ofCurrency.find((account) => account.id === defaultAccountId) ?? ofCurrency[0] ?? null;
}

/** What the device writes for the items: the user's category of each and the account of its currency. */
export function offlineRecords(items: readonly OfflineItem[], context: OfflineRecordsContext): OfflineRecordsResult {
  const records: QueuedRecordInput[] = [];
  for (const item of items) {
    const account = accountFor(item, context.accounts, context.defaultAccountId);
    if (account === null && item.currency === 'USD') return { ok: false, reason: 'no-dollar-account' };
    records.push({
      type: item.type,
      amountMinor: item.amountMinor,
      currency: item.currency,
      ...(account ? { accountId: account.id } : {}),
      ...categoryFor(item, context.categories),
      date: context.today,
      note: item.note,
      checkAmount: item.checkAmount,
    });
  }
  return { ok: true, records };
}
