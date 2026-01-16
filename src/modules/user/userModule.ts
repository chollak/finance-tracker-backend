/**
 * User Module
 * Manages user profiles and authentication
 */

import { UserRepository } from './domain/userRepository';
import { GetOrCreateUserUseCase } from './application/getOrCreateUserUseCase';
import { GetUserUseCase } from './application/getUserUseCase';
import { UpdateUserUseCase } from './application/updateUserUseCase';
import { RepositoryFactory } from '../../shared/infrastructure/database/repositoryFactory';

export class UserModule {
  private repository: UserRepository;
  private getOrCreateUserUseCase: GetOrCreateUserUseCase;
  private getUserUseCase: GetUserUseCase;
  private updateUserUseCase: UpdateUserUseCase;

  constructor(repository: UserRepository) {
    this.repository = repository;
    this.getOrCreateUserUseCase = new GetOrCreateUserUseCase(repository);
    this.getUserUseCase = new GetUserUseCase(repository);
    this.updateUserUseCase = new UpdateUserUseCase(repository);
  }

  static create(): UserModule {
    const repository = RepositoryFactory.createUserRepository();
    return new UserModule(repository);
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

  // Repository (for direct access if needed)
  getRepository(): UserRepository {
    return this.repository;
  }
}
