import { createTextMessageHandler } from '../src/delivery/messaging/telegram/handlers/messageHandlers';

describe('Telegram message handlers', () => {
  function createTextContext(overrides: Partial<any> = {}) {
    const execute = jest.fn().mockResolvedValue({
      text: 'кофе 15000',
      transactions: [],
      debts: [],
    });
    const reply = jest.fn().mockResolvedValue(undefined);
    const sendChatAction = jest.fn().mockResolvedValue(undefined);
    const getUserTransactionsExecute = jest.fn().mockResolvedValue([]);

    const ctx = {
      message: { text: 'кофе 15000' },
      from: { id: 131184740, first_name: 'Shukur' },
      session: {},
      reply,
      sendChatAction,
      modules: {
        voiceModule: {
          getProcessTextInputUseCase: () => ({ execute }),
        },
        transactionModule: {
          getGetUserTransactionsUseCase: () => ({ execute: getUserTransactionsExecute }),
        },
      },
      ...overrides,
    };

    return { ctx, execute, reply, sendChatAction, getUserTransactionsExecute };
  }

  it('shows Telegram typing action before processing a text finance message', async () => {
    const { ctx, execute, sendChatAction } = createTextContext();
    const handler = createTextMessageHandler();

    await handler(ctx as any);

    expect(sendChatAction).toHaveBeenCalledWith('typing');
    expect(execute).toHaveBeenCalledWith('кофе 15000', '131184740', 'Shukur');
    expect(sendChatAction.mock.invocationCallOrder[0]).toBeLessThan(execute.mock.invocationCallOrder[0]);
  });

  it('continues processing text input if Telegram typing action fails', async () => {
    const failingSendChatAction = jest.fn().mockRejectedValue(new Error('chat action unavailable'));
    const { ctx, execute } = createTextContext({
      sendChatAction: failingSendChatAction,
    });
    const handler = createTextMessageHandler();

    await handler(ctx as any);

    expect(failingSendChatAction).toHaveBeenCalledWith('typing');
    expect(execute).toHaveBeenCalledWith('кофе 15000', '131184740', 'Shukur');
  });

  it('excludes semantic non-expenses and needsReview transactions from Telegram daily/month totals', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-31T12:00:00.000Z'));

    const execute = jest.fn().mockResolvedValue({
      text: 'перевел 500000 на Alif',
      transactions: [{
        id: 'transfer-1',
        amount: 500000,
        category: 'transfer',
        type: 'expense',
        semanticType: 'own_transfer',
        needsReview: false,
        description: 'перевел на Alif',
      }],
      debts: [],
    });
    const getUserTransactionsExecute = jest.fn().mockResolvedValue([
      { amount: 45000, type: 'expense', semanticType: 'expense', needsReview: false, date: '2026-07-31T10:00:00.000Z' },
      { amount: 500000, type: 'expense', semanticType: 'own_transfer', needsReview: false, date: '2026-07-31T11:00:00.000Z' },
      { amount: 400000, type: 'expense', semanticType: 'expense', needsReview: true, date: '2026-07-31T11:30:00.000Z' },
    ]);
    const { ctx, reply } = createTextContext({
      message: { text: 'перевел 500000 на Alif' },
      modules: {
        voiceModule: {
          getProcessTextInputUseCase: () => ({ execute }),
        },
        transactionModule: {
          getGetUserTransactionsUseCase: () => ({ execute: getUserTransactionsExecute }),
        },
      },
    });
    const handler = createTextMessageHandler();

    await handler(ctx as any);

    const message = reply.mock.calls.find(([text]) => String(text).includes('Сохранено'))?.[0] as string;
    expect(message).toContain('↔️ Смысл: Перевод себе');
    expect(message).toContain('ℹ️ Не входит в расходы');
    expect(message).toContain('Сегодня: 45 000 UZS');
    expect(message).toContain('Месяц: 45 000 UZS');
    expect(message).not.toContain('Сегодня: 545 000 UZS');
    expect(message).not.toContain('Месяц: 945 000 UZS');

    jest.useRealTimers();
  });
});
