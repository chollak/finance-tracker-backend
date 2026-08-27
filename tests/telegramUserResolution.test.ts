/**
 * Глобальный middleware в telegramBot.ts делал getOrCreateUser и выбрасывал
 * результат — он никуда не присваивался. Затем обработчик резолвил того же
 * пользователя заново. На Supabase каждый getOrCreate — это два сетевых
 * round-trip (findByTelegramId + updateLastSeen), то есть на каждое сообщение
 * уходило два лишних обращения впустую.
 *
 * Теперь middleware кладёт uuid в контекст, а обработчик его переиспользует.
 */
import { resolveUserIdForContext } from '../src/delivery/messaging/telegram/handlers/messageHandlers';
import { BotContext } from '../src/delivery/messaging/telegram/types';
import { UserModule } from '../src/modules/user/userModule';

function userModuleWith(execute: jest.Mock): UserModule {
  return { getGetOrCreateUserUseCase: () => ({ execute }) } as unknown as UserModule;
}

describe('резолв пользователя в обработчике', () => {
  it('переиспользует uuid, положенный middleware, не ходя в базу', async () => {
    const execute = jest.fn();
    const ctx = { from: { id: 131184740 }, userUuid: 'uuid-из-middleware' } as unknown as BotContext;

    const userId = await resolveUserIdForContext(ctx, userModuleWith(execute));

    expect(userId).toBe('uuid-из-middleware');
    expect(execute).not.toHaveBeenCalled();
  });

  it('падает обратно на резолв, если middleware ничего не положил', async () => {
    const execute = jest.fn().mockResolvedValue({ id: 'uuid-из-базы' });
    const ctx = { from: { id: 131184740 } } as unknown as BotContext;

    const userId = await resolveUserIdForContext(ctx, userModuleWith(execute));

    expect(userId).toBe('uuid-из-базы');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('без userModule возвращает telegramId, как было раньше', async () => {
    const ctx = { from: { id: 131184740 } } as unknown as BotContext;

    const userId = await resolveUserIdForContext(ctx, undefined);

    expect(userId).toBe('131184740');
  });

  it('при сбое резолва не роняет обработку, а отдаёт telegramId', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('база недоступна'));
    const ctx = { from: { id: 131184740 } } as unknown as BotContext;

    const userId = await resolveUserIdForContext(ctx, userModuleWith(execute));

    expect(userId).toBe('131184740');
  });

  it('не принимает за uuid пустую строку из контекста', async () => {
    const execute = jest.fn().mockResolvedValue({ id: 'uuid-из-базы' });
    const ctx = { from: { id: 131184740 }, userUuid: '' } as unknown as BotContext;

    const userId = await resolveUserIdForContext(ctx, userModuleWith(execute));

    expect(userId).toBe('uuid-из-базы');
  });
});
