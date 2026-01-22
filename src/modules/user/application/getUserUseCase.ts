import { User } from '../domain/userEntity';
import { UserRepository } from '../domain/userRepository';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError } from '../../../shared/domain/errors/AppError';

export interface GetUserRequest {
  id?: string;
  telegramId?: string;
}

export class GetUserUseCase {
  constructor(private userRepository: UserRepository) {}

  async execute(request: GetUserRequest): Promise<Result<User | null>> {
    const { id, telegramId } = request;

    if (!id && !telegramId) {
      return ResultHelper.failure(new ValidationError('Either id or telegramId is required'));
    }

    if (id) {
      const user = await this.userRepository.findById(id);
      return ResultHelper.success(user);
    }

    if (telegramId) {
      const user = await this.userRepository.findByTelegramId(telegramId);
      return ResultHelper.success(user);
    }

    return ResultHelper.success(null);
  }
}
