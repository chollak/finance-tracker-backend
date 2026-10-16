import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { BusinessLogicError, ValidationError } from '../../../shared/domain/errors/AppError';
import {
  AUDIT_TIMES,
  DAILY_SUMMARY_TIMES,
  RECEIPT_TIPS_LIMIT,
  THEME_PREFERENCES,
  UserSettings,
  UserSettingsPatch,
  defaultUserSettings,
} from '../domain/userSettings';
import { UserSettingsRepository } from '../domain/userSettingsRepository';
import { getLogger, LogCategory } from '../../../shared/application/logging';

const logger = getLogger(LogCategory.USER);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isIsoDateTime(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
}

type FieldRule = (value: unknown) => string | null;

const oneOf = (allowed: readonly string[]): FieldRule => value =>
  typeof value === 'string' && allowed.includes(value) ? null : `must be one of: ${allowed.join(', ')}`;
const boolean: FieldRule = value => (typeof value === 'boolean' ? null : 'must be true or false');
const dateOrNull: FieldRule = value => (value === null || isIsoDate(value) ? null : 'must be a date YYYY-MM-DD or null');
const dateTimeOrNull: FieldRule = value =>
  value === null || isIsoDateTime(value) ? null : 'must be an ISO date-time or null';
const idOrNull: FieldRule = value =>
  value === null || (typeof value === 'string' && value.trim().length > 0) ? null : 'must be an id or null';
const tipsCount: FieldRule = value =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= RECEIPT_TIPS_LIMIT
    ? null
    : `must be an integer from 0 to ${RECEIPT_TIPS_LIMIT}`;

/**
 * Fields PATCH /api/settings accepts and how each is checked. `defaultAccountId` must also be one of
 * the user's visible accounts (checked in the use case); the own USD rate is set through FT-102.
 */
const RULES: Record<string, FieldRule> = {
  theme: oneOf(THEME_PREFERENCES),
  dailySummaryEnabled: boolean,
  dailySummaryTime: oneOf(DAILY_SUMMARY_TIMES),
  auditEnabled: boolean,
  auditTime: oneOf(AUDIT_TIMES),
  goalAlertsEnabled: boolean,
  onboardedAt: dateTimeOrNull,
  receiptTipsSeen: tipsCount,
  auditInviteSnoozedUntil: dateOrNull,
  defaultAccountId: idOrNull,
};

/** Check a PATCH body: an object with at least one known field, each value valid. Unknown fields are refused. */
export function validateSettingsPatch(body: unknown): Result<UserSettingsPatch, ValidationError> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return ResultHelper.failure(new ValidationError('Settings must be an object'));
  }
  const entries = Object.entries(body as Record<string, unknown>);
  if (entries.length === 0) {
    return ResultHelper.failure(new ValidationError('At least one setting must be provided'));
  }

  const problems: string[] = [];
  const patch: Record<string, unknown> = {};
  for (const [field, value] of entries) {
    const rule = RULES[field];
    if (!rule) {
      problems.push(`${field} is not a setting`);
      continue;
    }
    const problem = rule(value);
    if (problem) problems.push(`${field} ${problem}`);
    else patch[field] = value;
  }

  if (problems.length > 0) {
    return ResultHelper.failure(new ValidationError(problems.join('; ')));
  }
  return ResultHelper.success(patch as UserSettingsPatch);
}

export class GetUserSettingsUseCase {
  constructor(private repository: UserSettingsRepository) {}

  async execute(input: { userId: string }): Promise<Result<UserSettings>> {
    try {
      const stored = await this.repository.findByUserId(input.userId);
      return ResultHelper.success(stored ?? defaultUserSettings(input.userId));
    } catch (error) {
      logger.error('Failed to read settings', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to read settings'));
    }
  }
}

/** Whether an id is one of the user's visible accounts; provided by the account module (FT-101). */
export type AccountCheck = (userId: string, accountId: string) => Promise<boolean>;

export class UpdateUserSettingsUseCase {
  private accountCheck?: AccountCheck;

  constructor(private repository: UserSettingsRepository) {}

  setAccountCheck(check: AccountCheck): void {
    this.accountCheck = check;
  }

  async execute(input: { userId: string; patch: unknown }): Promise<Result<UserSettings>> {
    const validated = validateSettingsPatch(input.patch);
    if (!validated.success) return validated;

    try {
      const accountId = validated.data.defaultAccountId;
      if (typeof accountId === 'string' && !(this.accountCheck && (await this.accountCheck(input.userId, accountId)))) {
        return ResultHelper.failure(new ValidationError('defaultAccountId must be one of your visible accounts', 'defaultAccountId'));
      }

      const current = (await this.repository.findByUserId(input.userId)) ?? defaultUserSettings(input.userId);
      const saved = await this.repository.upsert({ ...current, ...validated.data, userId: input.userId });
      return ResultHelper.success(saved);
    } catch (error) {
      logger.error('Failed to save settings', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to save settings'));
    }
  }
}
