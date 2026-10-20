import type { Currency } from '@/shared/lib/money';

/** The user's settings as `GET /api/settings` returns them (FT-098, docs/pastel/api.md «Настройки»). */
export interface UserSettings {
  userId: string;
  theme: 'telegram' | 'light' | 'dark';
  dailySummaryEnabled: boolean;
  dailySummaryTime: string;
  auditEnabled: boolean;
  auditTime: string;
  goalAlertsEnabled: boolean;
  fxOwnRateMinor: number | null;
  fxOwnSince: string | null;
  defaultAccountId: string | null;
  /** When the first launch was completed (ISO); null shows «Сколько у вас сейчас денег?» (FT-109). */
  onboardedAt: string | null;
  receiptTipsSeen: number;
  auditInviteSnoozedUntil: string | null;
  /**
   * «Сум / USD» on Home (FT-137): the currency of the balance card and the month tiles. Settings read before
   * the field existed have none: сум.
   */
  displayCurrency?: Currency;
}

/** What `PATCH /api/settings` changes; the user and the own rate are not set here. */
export type SettingsPatch = Partial<Omit<UserSettings, 'userId' | 'fxOwnRateMinor' | 'fxOwnSince'>>;
