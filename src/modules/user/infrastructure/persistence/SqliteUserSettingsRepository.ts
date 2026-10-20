import { DataSource, Repository } from 'typeorm';
import { AppDataSource } from '../../../../shared/infrastructure/database/database.config';
import { UserSettings as UserSettingsEntity } from '../../../../shared/infrastructure/database/entities/UserSettings';
import {
  DISPLAY_CURRENCIES,
  DisplayCurrency,
  THEME_PREFERENCES,
  ThemePreference,
  UserSettings,
  UserSettingsChanges,
  defaultUserSettings,
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

  async findAll(): Promise<UserSettings[]> {
    const entities = await this.repository.find();
    return entities.map(entity => this.toDomain(entity));
  }

  /**
   * One statement: `INSERT … ON CONFLICT (user_id) DO UPDATE SET <the given fields>, updated_at`. A new
   * user's first changes may come at once (FT-140), and a read-then-write of the whole row let parallel
   * PATCHes of different fields undo each other (FT-141). The insert carries the defaults for a new row.
   */
  async write(userId: string, changes: UserSettingsChanges): Promise<UserSettings> {
    const fields = Object.keys(changes).filter(field => changes[field as keyof UserSettingsChanges] !== undefined);
    const overwrite = fields.map(field => {
      const column = this.repository.metadata.findColumnWithPropertyName(field);
      if (!column || field === 'userId') throw new Error(`${field} is not a settings column`);
      return column.databaseName;
    });
    const updatedAt = this.repository.metadata.updateDateColumn?.databaseName ?? 'updated_at';

    const row = { ...defaultUserSettings(userId), ...changes, userId };
    await this.repository
      .createQueryBuilder()
      .insert()
      .values({ ...row, onboardedAt: row.onboardedAt ? new Date(row.onboardedAt) : null })
      .orUpdate([...overwrite, updatedAt], ['user_id'])
      .execute();

    const stored = await this.findByUserId(userId);
    if (!stored) throw new Error(`Failed to save settings for user ${userId}`);
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
