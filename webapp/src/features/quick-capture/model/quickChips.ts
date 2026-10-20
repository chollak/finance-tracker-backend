import { visibleAccounts, type Account } from '@/entities/account';
import { pickableCategories, type Category } from '@/entities/category';
import type { FrequentRecord } from '@/entities/transaction';
import { formatMinor, MINUS, type Currency } from '@/shared/lib/money';
import type { PastelColor } from '@/shared/lib/pastel/categoryColors';

/**
 * The quick chips over the composer (FT-114, Composer.md «Частые операции», board «Главная»): a tap writes
 * the expense at once. They are the user's frequent expenses — the server picks them by its rule
 * (`FREQUENT_RECORDS_RULE`: up to 6 «category + note + amount» of the last 30 days, from 3 repeats); a
 * newcomer without any gets the four starters of the prototype.
 */

export interface StarterChip {
  note: string;
  amountMinor: number;
  /** The starter category it goes to, whatever the user renamed it to. */
  presetKey: string;
}

/** The four chips of the prototype (board «Главная»), in сум. */
export const STARTER_CHIPS: readonly StarterChip[] = [
  { note: 'Кофе', amountMinor: 2_500_000, presetKey: 'cafe' },
  { note: 'Такси', amountMinor: 1_800_000, presetKey: 'transport' },
  { note: 'Обед', amountMinor: 4_500_000, presetKey: 'cafe' },
  { note: 'Продукты', amountMinor: 15_000_000, presetKey: 'groceries' },
];

/** What a chip writes: an expense of today. */
export interface QuickChipRecord {
  categoryId: string;
  categoryName: string;
  note: string;
  amountMinor: number;
  currency: Currency;
  /** None while the user has no accounts. */
  accountId?: string;
  accountName?: string;
}

export interface QuickChip {
  key: string;
  /** The note; the category's name when it was written without one. */
  name: string;
  /** «25 000», «9,99» — without sign and unit, as the board draws it. */
  amount: string;
  color: PastelColor;
  /** «Записать сразу: Кофе, 25 000 сум». */
  aria: string;
  record: QuickChipRecord;
}

export interface QuickChipsInput {
  /** The server's frequent expenses; undefined while they are being read. */
  frequent: readonly FrequentRecord[] | undefined;
  categories: readonly Category[];
  /** Every account of the user (hidden too). */
  accounts: readonly Account[];
  defaultAccountId: string | null | undefined;
}

/**
 * The account a chip writes to: its own while visible, else the default one if it has the chip's currency,
 * else the first visible one of that currency. Null when the user has accounts but none of that currency;
 * undefined when there are no accounts at all.
 */
function chipAccount(
  wanted: string | null,
  currency: Currency,
  accounts: readonly Account[],
  defaultAccountId: string | null | undefined
): Account | null | undefined {
  if (accounts.length === 0) return undefined;
  const ofCurrency = visibleAccounts(accounts).filter((account) => account.currency === currency);
  return (
    ofCurrency.find((account) => account.id === wanted) ??
    ofCurrency.find((account) => account.id === defaultAccountId) ??
    ofCurrency[0] ??
    null
  );
}

function chip(
  key: string,
  note: string,
  amountMinor: number,
  currency: Currency,
  category: Category,
  account: Account | undefined
): QuickChip {
  const name = note || category.name;
  const amount = formatMinor(amountMinor, currency, { sign: 'none', unit: false });
  return {
    key,
    name,
    amount,
    color: category.color,
    aria: `Записать сразу: ${name}, ${formatMinor(amountMinor, currency, { sign: 'none' })}`,
    record: {
      categoryId: category.id,
      categoryName: category.name,
      note,
      amountMinor,
      currency,
      ...(account ? { accountId: account.id, accountName: account.name } : {}),
    },
  };
}

export function quickChips({ frequent, categories, accounts, defaultAccountId }: QuickChipsInput): QuickChip[] {
  // Starters first and then the real ones would make the row jump under a finger: wait for the answer
  if (frequent === undefined) return [];

  const offered = pickableCategories(categories, 'expense');
  const fromFrequent = frequent.flatMap((item, index) => {
    const category = offered.find((candidate) => candidate.id === item.categoryId);
    const account = chipAccount(item.accountId, item.currency, accounts, defaultAccountId);
    if (!category || account === null) return [];
    return [chip(`f${index}`, item.note, item.amountMinor, item.currency, category, account)];
  });
  if (fromFrequent.length > 0) return fromFrequent;

  return STARTER_CHIPS.flatMap((starter, index) => {
    const category = offered.find((candidate) => candidate.presetKey === starter.presetKey);
    const account = chipAccount(null, 'UZS', accounts, defaultAccountId);
    if (!category || account === null) return [];
    return [chip(`s${index}`, starter.note, starter.amountMinor, 'UZS', category, account)];
  });
}

/** The second line of «Записано» (Toast.md): «Кофе · −25 000 сум · Карта». */
export function quickChipSavedDetail(record: QuickChipRecord): string {
  return [record.note || record.categoryName, `${MINUS}${formatMinor(record.amountMinor, record.currency, { sign: 'none' })}`, record.accountName]
    .filter(Boolean)
    .join(' · ');
}
