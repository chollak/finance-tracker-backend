/**
 * Update User Use Case
 */

import { User, UpdateUserDTO } from '../domain/userEntity';
import { UserRepository } from '../domain/userRepository';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';

export class UpdateUserUseCase {
  constructor(private userRepository: UserRepository) {}

  async execute(id: string, dto: UpdateUserDTO): Promise<Result<User>> {
    try {
      const user = await this.userRepository.update(id, dto);
      return ResultHelper.success(user);
    } catch (error) {
      return ResultHelper.failure(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async updateLastSeen(id: string): Promise<void> {
    return this.userRepository.updateLastSeen(id);
  }
}
