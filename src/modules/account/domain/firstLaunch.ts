import { AccountKind, Currency, uuidFrom } from './account';

/**
 * First launch (FT-109, docs/pastel/money-model.md «Миграция существующих данных», step 4):
 * «Сколько у вас сейчас денег?» — cash, card and dollars become opening balances dated today, so the
 * history before today stays in history and analytics but no longer makes the balance meaningless.
 */

export type FirstLaunchSlot = 'cash' | 'card' | 'usd';

export interface FirstLaunchAccount {
  slot: FirstLaunchSlot;
  /** Field of the request body with this account's amount in minor units. */
  field: 'cashMinor' | 'cardMinor' | 'usdMinor';
  name: string;
  kind: AccountKind;
  currency: Currency;
}

/** The three rows of the first-launch screen, in its order. */
export const FIRST_LAUNCH_ACCOUNTS: readonly FirstLaunchAccount[] = [
  { slot: 'cash', field: 'cashMinor', name: 'Наличные', kind: 'cash', currency: 'UZS' },
  { slot: 'card', field: 'cardMinor', name: 'Карта', kind: 'card', currency: 'UZS' },
  { slot: 'usd', field: 'usdMinor', name: 'Доллары', kind: 'cash', currency: 'USD' },
];

/**
 * The id of an account the first launch creates: derived from the user and the row, so a repeated or
 * concurrent first launch cannot create a second «Наличные» — the second insert hits the primary key.
 */
export function firstLaunchAccountId(userId: string, slot: FirstLaunchSlot): string {
  return uuidFrom(`first-launch-account:${slot}:${userId}`);
}

/** Port to the user's settings (FT-098): whether the first launch is done, and marking it done. */
export interface FirstLaunchProgress {
  /** ISO moment the first launch was completed, or null while it is pending. */
  onboardedAt(userId: string): Promise<string | null>;
  markOnboarded(userId: string, at: string): Promise<void>;
}
