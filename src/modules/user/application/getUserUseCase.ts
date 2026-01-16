/**
 * Get User Use Case
 */

import { User } from '../domain/userEntity';
import { UserRepository } from '../domain/userRepository';

export class GetUserUseCase {
  constructor(private userRepository: UserRepository) {}

  async executeById(id: string): Promise<User | null> {
    return this.userRepository.findById(id);
  }

  async executeByTelegramId(telegramId: string): Promise<User | null> {
    return this.userRepository.findByTelegramId(telegramId);
  }
}
