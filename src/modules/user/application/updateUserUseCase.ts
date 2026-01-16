/**
 * Update User Use Case
 */

import { User, UpdateUserDTO } from '../domain/userEntity';
import { UserRepository } from '../domain/userRepository';

export class UpdateUserUseCase {
  constructor(private userRepository: UserRepository) {}

  async execute(id: string, dto: UpdateUserDTO): Promise<User> {
    return this.userRepository.update(id, dto);
  }

  async updateLastSeen(id: string): Promise<void> {
    return this.userRepository.updateLastSeen(id);
  }
}
