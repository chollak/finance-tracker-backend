/**
 * Индикатор «печатает» раньше стоял после резолва пользователя, то есть после
 * обращения к базе (а на Supabase — после сетевого round-trip). Из-за этого
 * пауза «бот меня вообще услышал?» была длиннее, чем требовалось.
 *
 * Общее время ответа перенос не меняет — меняет ощущаемое. Тест охраняет
 * именно порядок: индикатор обязан идти до любых обращений наружу.
 */
import {
  createTextMessageHandler,
  createVoiceMessageHandler,
} from '../src/delivery/messaging/telegram/handlers/messageHandlers';
import { BotContext } from '../src/delivery/messaging/telegram/types';
import { UserModule } from '../src/modules/user/userModule';

function trackingUserModule(order: string[]): UserModule {
  return {
    getGetOrCreateUserUseCase: () => ({
      execute: jest.fn(async () => {
        order.push('резолв пользователя');
        return { id: 'uuid-1' };
      }),
    }),
  } as unknown as UserModule;
}

function baseContext(order: string[], message: Record<string, unknown>): BotContext {
  return {
    from: { id: 131184740, first_name: 'Тест' },
    message,
    session: {},
    reply: jest.fn(async () => undefined),
    sendChatAction: jest.fn(async () => {
      order.push('индикатор');
      return true;
    }),
    telegram: {
      getFileLink: jest.fn(async () => {
        order.push('обращение к Telegram за файлом');
        return { href: '' };
      }),
    },
    modules: {
      voiceModule: {
        getProcessTextInputUseCase: () => ({
          execute: jest.fn(async () => {
            order.push('разбор текста');
            return { text: '', transactions: [], debts: [] };
          }),
        }),
      },
      transactionModule: {},
    },
  } as unknown as BotContext;
}

describe('порядок показа индикатора', () => {
  it('в текстовом обработчике индикатор идёт до резолва пользователя', async () => {
    const order: string[] = [];
    const handler = createTextMessageHandler(trackingUserModule(order));

    await handler(baseContext(order, { text: 'такси 18000' }));

    expect(order[0]).toBe('индикатор');
    expect(order).toContain('резолв пользователя');
    expect(order.indexOf('индикатор')).toBeLessThan(order.indexOf('резолв пользователя'));
  });

  it('в голосовом обработчике индикатор идёт до резолва и до запроса файла', async () => {
    const order: string[] = [];
    const handler = createVoiceMessageHandler(trackingUserModule(order));

    await handler(baseContext(order, { voice: { file_id: 'voice-1' } }));

    expect(order[0]).toBe('индикатор');
    expect(order.indexOf('индикатор')).toBeLessThan(order.indexOf('резолв пользователя'));
  });

  it('на команду индикатор не показывается', async () => {
    const order: string[] = [];
    const handler = createTextMessageHandler(trackingUserModule(order));

    await handler(baseContext(order, { text: '/start' }));

    expect(order).toEqual([]);
  });

  it('отказ Telegram показать индикатор не ломает обработку', async () => {
    const order: string[] = [];
    const ctx = baseContext(order, { text: 'такси 18000' });
    (ctx.sendChatAction as jest.Mock).mockRejectedValue(new Error('429 Too Many Requests'));

    const handler = createTextMessageHandler(trackingUserModule(order));

    await expect(handler(ctx)).resolves.toBeUndefined();
    expect(order).toContain('разбор текста');
  });
});
