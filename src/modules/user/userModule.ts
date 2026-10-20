/**
 * User Module
 * Manages user profiles, authentication and per-user settings (FT-098)
 */

import { UserRepository } from './domain/userRepository';
import { UserSettingsRepository } from './domain/userSettingsRepository';
import { AccountCheck, GetUserSettingsUseCase, UpdateUserSettingsUseCase } from './application/userSettingsUseCases';
import { GetOrCreateUserUseCase } from './application/getOrCreateUserUseCase';
import { GetUserUseCase } from './application/getUserUseCase';
import { UpdateUserUseCase } from './application/updateUserUseCase';
import { RepositoryFactory } from '../../shared/infrastructure/database/repositoryFactory';

export class UserModule {
  private repository: UserRepository;
  private getOrCreateUserUseCase: GetOrCreateUserUseCase;
  private getUserUseCase: GetUserUseCase;
  private updateUserUseCase: UpdateUserUseCase;
  private getUserSettingsUseCase?: GetUserSettingsUseCase;
  private updateUserSettingsUseCase?: UpdateUserSettingsUseCase;

  constructor(repository: UserRepository, private settingsRepository?: UserSettingsRepository) {
    this.repository = repository;
    this.getOrCreateUserUseCase = new GetOrCreateUserUseCase(repository);
    this.getUserUseCase = new GetUserUseCase(repository);
    this.updateUserUseCase = new UpdateUserUseCase(repository);
    if (settingsRepository) {
      this.getUserSettingsUseCase = new GetUserSettingsUseCase(settingsRepository);
      this.updateUserSettingsUseCase = new UpdateUserSettingsUseCase(settingsRepository);
    }
  }

  static create(): UserModule {
    return new UserModule(
      RepositoryFactory.createUserRepository(),
      RepositoryFactory.createUserSettingsRepository()
    );
  }

  // Use Cases
  getGetOrCreateUserUseCase(): GetOrCreateUserUseCase {
    return this.getOrCreateUserUseCase;
  }

  getGetUserUseCase(): GetUserUseCase {
    return this.getUserUseCase;
  }

  getUpdateUserUseCase(): UpdateUserUseCase {
    return this.updateUserUseCase;
  }

  /** The default account setting must name a visible account (FT-101); wired by createModules(). */
  setAccountCheck(check: AccountCheck): void {
    this.updateUserSettingsUseCase?.setAccountCheck(check);
  }

  /** The user's own USD rate (FT-102), or null when the Central Bank rate applies. */
  async ownUsdRate(userId: string): Promise<{ rateMinor: number; since: string } | null> {
    if (!this.getUserSettingsUseCase) return null;
    const result = await this.getUserSettingsUseCase.execute({ userId });
    if (!result.success || result.data.fxOwnRateMinor === null || !result.data.fxOwnSince) return null;
    return { rateMinor: result.data.fxOwnRateMinor, since: result.data.fxOwnSince };
  }

  /** Set the own USD rate, or clear it with null. The value is checked by the rates module. */
  async setOwnUsdRate(userId: string, rate: { rateMinor: number; since: string } | null): Promise<void> {
    if (!this.settingsRepository) throw new Error('UserModule was created without a settings repository');
    await this.settingsRepository.write(userId, {
      fxOwnRateMinor: rate ? rate.rateMinor : null,
      fxOwnSince: rate ? rate.since : null,
    });
  }

  /** When the user completed the first launch (FT-109), or null while it is pending. */
  async onboardedAt(userId: string): Promise<string | null> {
    if (!this.settingsRepository) throw new Error('UserModule was created without a settings repository');
    const stored = await this.settingsRepository.findByUserId(userId);
    return stored?.onboardedAt ?? null;
  }

  /** Mark the first launch done; the first-launch screen is no longer shown. */
  async markOnboarded(userId: string, at: string): Promise<void> {
    if (!this.settingsRepository) throw new Error('UserModule was created without a settings repository');
    await this.settingsRepository.write(userId, { onboardedAt: at });
  }

  /** The user's default account from settings, or null. */
  async defaultAccountId(userId: string): Promise<string | null> {
    if (!this.getUserSettingsUseCase) return null;
    const result = await this.getUserSettingsUseCase.execute({ userId });
    return result.success ? result.data.defaultAccountId : null;
  }

  getGetUserSettingsUseCase(): GetUserSettingsUseCase {
    if (!this.getUserSettingsUseCase) throw new Error('UserModule was created without a settings repository');
    return this.getUserSettingsUseCase;
  }

  getUpdateUserSettingsUseCase(): UpdateUserSettingsUseCase {
    if (!this.updateUserSettingsUseCase) throw new Error('UserModule was created without a settings repository');
    return this.updateUserSettingsUseCase;
  }

  // Repository (for direct access if needed)
  getRepository(): UserRepository {
    return this.repository;
  }
}
