import { registerCommandHandlers, handleWeeklyReview } from '../src/delivery/messaging/telegram/handlers/commandHandlers';

describe('Telegram weekly review command', () => {
  function registerCommands() {
    const commands = new Map<string, Function>();
    const bot = {
      command: jest.fn((name: string, handler: Function) => commands.set(name, handler)),
    };
    registerCommandHandlers(bot as any);
    return { bot, commands };
  }

  // Заморожено 2026-08-26 (src/frozen.ts): в боте остался только /start.
  // Обработчик живёт дальше и проверяется напрямую — см. следующий тест.
  it('does not register /week and /weekly while the product is frozen to capture', () => {
    const { commands } = registerCommands();

    expect(commands.has('week')).toBe(false);
    expect(commands.has('weekly')).toBe(false);
    expect([...commands.keys()]).toEqual(['start']);
  });

  it('replies with previous-week semantic review for the Telegram user', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-31T12:00:00.000Z'));

    const reply = jest.fn().mockResolvedValue(undefined);
    const execute = jest.fn().mockResolvedValue([
      { amount: 50000, category: 'coffee', type: 'expense', semanticType: 'expense', needsReview: false, date: '2026-07-21', userId: 'uuid-1' },
      { amount: 2000000, category: 'transfer', type: 'expense', semanticType: 'saving_deposit', needsReview: false, date: '2026-07-22', userId: 'uuid-1' },
      { amount: 400000, category: 'restaurants', type: 'expense', semanticType: 'group_payment', needsReview: true, date: '2026-07-23', userId: 'uuid-1' },
      { amount: 999999, category: 'coffee', type: 'expense', semanticType: 'expense', needsReview: false, date: '2026-07-28', userId: 'uuid-1' },
    ]);
    const ctx = {
      from: { id: 131184740 },
      reply,
      modules: {
        userModule: {
          getGetOrCreateUserUseCase: () => ({ execute: jest.fn().mockResolvedValue({ id: 'uuid-1' }) }),
        },
        transactionModule: {
          getGetUserTransactionsUseCase: () => ({ execute }),
        },
      },
    };

    await handleWeeklyReview(ctx as any);

    expect(execute).toHaveBeenCalledWith('uuid-1');
    expect(reply).toHaveBeenCalledWith(
      expect.stringContaining('🗓️ <b>Еженедельный обзор</b>'),
      expect.objectContaining({ parse_mode: 'HTML' })
    );
    const message = reply.mock.calls[0][0] as string;
    expect(message).toContain('20.07–26.07');
    expect(message).toContain('💸 Реальные расходы: 50 000');
    expect(message).toContain('↔️ Не расходы: 2 000 000');
    expect(message).toContain('⚠️ Нужно проверить: 1 операции на 400 000');
    expect(message).not.toContain('999 999');

    jest.useRealTimers();
  });
});
