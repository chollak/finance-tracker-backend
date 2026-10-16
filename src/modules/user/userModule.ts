/**
 * User Module
 * Manages user profiles, authentication and per-user settings (FT-098)
 */

import { UserRepository } from './domain/userRepository';
import { UserSettingsRepository } from './domain/userSettingsRepository';
import { GetUserSettingsUseCase, UpdateUserSettingsUseCase } from './application/userSettingsUseCases';
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

  constructor(repository: UserRepository, settingsRepository?: UserSettingsRepository) {
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
