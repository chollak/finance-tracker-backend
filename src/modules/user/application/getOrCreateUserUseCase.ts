/**
 * Get or Create User Use Case
 * Creates a new user if not exists, or returns existing user
 */

import { User, CreateUserDTO } from '../domain/userEntity';
import { UserRepository } from '../domain/userRepository';

export class GetOrCreateUserUseCase {
  constructor(private userRepository: UserRepository) {}

  async execute(dto: CreateUserDTO): Promise<User> {
    return this.userRepository.getOrCreate(dto);
  }
}
