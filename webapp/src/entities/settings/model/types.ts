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
}
