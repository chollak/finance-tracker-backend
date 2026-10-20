/**
 * The choices `PATCH /api/settings` accepts for the bot's notices (docs/pastel/api.md «Настройки»; the server's
 * `DAILY_SUMMARY_TIMES` and `AUDIT_TIMES` in `src/modules/user/domain/userSettings.ts`): the summary in the evening,
 * the audit on the 1st of the month.
 */
export const DAILY_SUMMARY_TIMES = ['20:00', '21:00', '22:00', '23:00'] as const;
export const AUDIT_TIMES = ['09:00', '10:00', '12:00', '19:00'] as const;
