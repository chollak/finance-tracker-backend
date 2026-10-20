import { DataSource, Repository } from 'typeorm';
import { AppDataSource } from '../../../../shared/infrastructure/database/database.config';
import { UserSettings as UserSettingsEntity } from '../../../../shared/infrastructure/database/entities/UserSettings';
import {
  DISPLAY_CURRENCIES,
  DisplayCurrency,
  THEME_PREFERENCES,
  ThemePreference,
  UserSettings,
} from '../../domain/userSettings';
import { UserSettingsRepository } from '../../domain/userSettingsRepository';

export class SqliteUserSettingsRepository implements UserSettingsRepository {
  private repository: Repository<UserSettingsEntity>;

  constructor(dataSource: DataSource = AppDataSource) {
    this.repository = dataSource.getRepository(UserSettingsEntity);
  }

  async findByUserId(userId: string): Promise<UserSettings | null> {
    const entity = await this.repository.findOne({ where: { userId } });
    return entity ? this.toDomain(entity) : null;
  }

  /**
   * One statement, `INSERT … ON CONFLICT (user_id) DO UPDATE`: a new user's first changes may come at once
   * (FT-140), and `save()` — a read, then an insert — let two of them insert the same row.
   */
  async upsert(settings: UserSettings): Promise<UserSettings> {
    await this.repository.upsert(
      { ...settings, onboardedAt: settings.onboardedAt ? new Date(settings.onboardedAt) : null },
      ['userId']
    );
    const stored = await this.findByUserId(settings.userId);
    if (!stored) throw new Error(`Failed to save settings for user ${settings.userId}`);
    return stored;
  }

  private toDomain(entity: UserSettingsEntity): UserSettings {
    const theme = (THEME_PREFERENCES as readonly string[]).includes(entity.theme)
      ? (entity.theme as ThemePreference)
      : 'telegram';
    const displayCurrency = (DISPLAY_CURRENCIES as readonly string[]).includes(entity.displayCurrency)
      ? (entity.displayCurrency as DisplayCurrency)
      : 'UZS';
    return {
      userId: entity.userId,
      theme,
      dailySummaryEnabled: Boolean(entity.dailySummaryEnabled),
      dailySummaryTime: entity.dailySummaryTime,
      auditEnabled: Boolean(entity.auditEnabled),
      auditTime: entity.auditTime,
      goalAlertsEnabled: Boolean(entity.goalAlertsEnabled),
      fxOwnRateMinor: entity.fxOwnRateMinor ?? null,
      fxOwnSince: entity.fxOwnSince ?? null,
      defaultAccountId: entity.defaultAccountId ?? null,
      onboardedAt: entity.onboardedAt ? new Date(entity.onboardedAt).toISOString() : null,
      receiptTipsSeen: Number(entity.receiptTipsSeen ?? 0),
      auditInviteSnoozedUntil: entity.auditInviteSnoozedUntil ?? null,
      displayCurrency,
    };
  }
}
