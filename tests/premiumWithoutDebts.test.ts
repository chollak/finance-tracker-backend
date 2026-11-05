import { Telegram } from 'telegraf';
import { TelegramPaymentService } from '../src/modules/subscription/infrastructure/TelegramPaymentService';
import { registerPaymentHandlers } from '../src/delivery/messaging/telegram/handlers/paymentHandlers';
import { SubscriptionModule } from '../src/modules/subscription/subscriptionModule';

/**
 * #265 (decision 2026-11-04): debts are gone, so the Premium the bot sells does not promise them — not in `/premium`, not
 * in the Telegram Stars invoice its button sends, not in the thanks after the payment. The rest of `/premium` is #319.
 */

const DEBT_WORDING = /долг/i;

type Handler = (ctx: any) => Promise<void>;

/** A bot that only keeps the handlers registerPaymentHandlers gives it. */
function botWithHandlers() {
  const handlers: Record<string, Handler> = {};
  const bot = {
    command: (name: string, handler: Handler) => { handlers[`/${name}`] = handler; },
    action: (name: string, handler: Handler) => { handlers[name] = handler; },
    on: (filter: unknown, handler: Handler) => {
      handlers[typeof filter === 'string' ? filter : 'successful_payment'] = handler;
    },
  };
  return { bot, handlers };
}

function contextFor(extra: Record<string, unknown> = {}) {
  return {
    from: { id: 131265001, username: 'shukur', first_name: 'Шукур' },
    chat: { id: 131265001 },
    modules: {
      userModule: { getGetOrCreateUserUseCase: () => ({ execute: async () => ({ id: 'user-uuid-265' }) }) },
    },
    reply: jest.fn().mockResolvedValue(undefined),
    answerCbQuery: jest.fn().mockResolvedValue(undefined),
    ...extra,
  };
}

const freePlan = {
  isPremium: false,
  subscription: null,
  limits: {
    transactions: { used: 3, limit: null, remaining: null },
    voiceInputs: { used: 1, limit: null, remaining: null },
  },
};

const subscriptionModule = {
  getGetSubscriptionUseCase: () => ({ execute: async () => freePlan }),
  getCreateSubscriptionUseCase: () => ({ execute: async () => ({ id: 'sub-265' }) }),
} as unknown as SubscriptionModule;

describe('Premium promises no debts (#265)', () => {
  it('the Telegram Stars invoice lists no debts', async () => {
    const sendInvoice = jest.fn().mockResolvedValue(undefined);
    const service = new TelegramPaymentService({ sendInvoice } as unknown as Telegram);

    await service.sendPremiumInvoice({ chatId: 1, userId: 'user-uuid-265' });

    const invoice = sendInvoice.mock.calls[0][1];
    expect(invoice.description).toContain('Безлимит транзакций');
    expect(invoice.description).not.toMatch(DEBT_WORDING);
    expect(invoice.title).not.toMatch(DEBT_WORDING);
  });

  it('/premium on the free plan names no debts', async () => {
    const { bot, handlers } = botWithHandlers();
    registerPaymentHandlers(bot as never, subscriptionModule, {} as TelegramPaymentService);
    const ctx = contextFor();

    await handlers['/premium'](ctx);

    const [text] = ctx.reply.mock.calls[0];
    expect(text).toContain('Ваш текущий план: Free');
    expect(text).not.toMatch(DEBT_WORDING);
  });

  it('the thanks after the payment names no debts', async () => {
    const { bot, handlers } = botWithHandlers();
    const paymentService = { parsePayload: () => ({ userId: 'user-uuid-265', type: 'premium' }) } as unknown as TelegramPaymentService;
    registerPaymentHandlers(bot as never, subscriptionModule, paymentService);
    const ctx = contextFor({
      message: {
        successful_payment: {
          invoice_payload: '{}', total_amount: 100, telegram_payment_charge_id: 'tg-1', provider_payment_charge_id: 'pr-1',
        },
      },
    });

    await handlers.successful_payment(ctx);

    const [text] = ctx.reply.mock.calls[0];
    expect(text).toContain('Спасибо за покупку Premium');
    expect(text).not.toMatch(DEBT_WORDING);
  });
});
