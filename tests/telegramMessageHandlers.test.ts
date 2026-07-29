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
        transactionModule: {},
      },
      ...overrides,
    };

    return { ctx, execute, reply, sendChatAction };
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
});
