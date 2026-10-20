/**
 * Per-user settings (FT-098, docs/pastel/money-model.md → `user_settings`).
 *
 * A user without a stored row has the defaults below; the row is written on the first change.
 */

export const THEME_PREFERENCES = ['telegram', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** «Итог дня» can be sent at 20:00–23:00 (the design offers these four steps). */
export const DAILY_SUMMARY_TIMES = ['20:00', '21:00', '22:00', '23:00'] as const;
/** The monthly audit reminder on the 1st: 09:00, 10:00, 12:00 or 19:00. */
export const AUDIT_TIMES = ['09:00', '10:00', '12:00', '19:00'] as const;

/** The currency Home shows the balance and the month tiles in: «Сум / USD» in its header (FT-137). */
export const DISPLAY_CURRENCIES = ['UZS', 'USD'] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

/** Receipt photo tips are shown until the user has seen them this many times. */
export const RECEIPT_TIPS_LIMIT = 3;

export interface UserSettings {
  userId: string;
  theme: ThemePreference;
  dailySummaryEnabled: boolean;
  dailySummaryTime: string;
  auditEnabled: boolean;
  auditTime: string;
  /** Goal alerts at 80% and 100%, and subscription charges. */
  goalAlertsEnabled: boolean;
  /** Own USD rate in minor units of сум per 1 USD; null means the Central Bank rate (FT-102). */
  fxOwnRateMinor: number | null;
  /** Date the own rate applies from (YYYY-MM-DD). */
  fxOwnSince: string | null;
  /** Account suggested for new records (FT-101); null until accounts exist. */
  defaultAccountId: string | null;
  /** When the first launch was completed (ISO); null shows the first-launch flow (FT-109). */
  onboardedAt: string | null;
  receiptTipsSeen: number;
  /** The audit invitation is hidden until this date (YYYY-MM-DD). */
  auditInviteSnoozedUntil: string | null;
  /**
   * The currency chosen with «Сум / USD» on Home (FT-137). A choice, not a fact: without a USD rate Home
   * shows сум whatever is chosen here, and comes back to dollars once a rate is known.
   */
  displayCurrency: DisplayCurrency;
}

export function defaultUserSettings(userId: string): UserSettings {
  return {
    userId,
    theme: 'telegram',
    dailySummaryEnabled: true,
    dailySummaryTime: '21:00',
    auditEnabled: true,
    auditTime: '10:00',
    goalAlertsEnabled: true,
    fxOwnRateMinor: null,
    fxOwnSince: null,
    defaultAccountId: null,
    onboardedAt: null,
    receiptTipsSeen: 0,
    auditInviteSnoozedUntil: null,
    displayCurrency: 'UZS',
  };
}

/** Fields one write changes; the others stay as they are (FT-141). */
export type UserSettingsChanges = Partial<Omit<UserSettings, 'userId'>>;

/** Fields a client may change through PATCH /api/settings. */
export type UserSettingsPatch = Omit<UserSettingsChanges, 'fxOwnSince'>;
