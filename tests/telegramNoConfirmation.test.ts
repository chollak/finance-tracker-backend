/**
 * Транзакция сохраняется всегда, независимо от уверенности парсера. Раньше при
 * confidence < 0.6 показывалась клавиатура подтверждения — то есть лишнее
 * действие в каждом неуверенном случае поверх уже сохранённой записи.
 *
 * Решение спеки: подтверждения нет ни при какой уверенности. Низкая уверенность
 * остаётся видимой в тексте карточки, но набор кнопок одинаков.
 */
import { sendTransactionResponse } from '../src/delivery/messaging/telegram/handlers/messageHandlers';
import { BotContext } from '../src/delivery/messaging/telegram/types';
import { ProcessedTransaction } from '../src/delivery/messaging/telegram/types';

function transactionWith(confidence: number): ProcessedTransaction {
  return {
    id: 'tx-1',
    amount: 45000,
    category: 'groceries',
    type: 'expense',
    semanticType: 'expense',
    needsReview: false,
    date: '2026-08-27',
    confidence,
    description: 'Продукты',
  } as unknown as ProcessedTransaction;
}

async function keyboardFor(confidence: number): Promise<unknown> {
  const reply = jest.fn(async () => undefined);
  const ctx = { reply } as unknown as BotContext;

  await sendTransactionResponse(ctx, transactionWith(confidence), 'продукты 45000', 'user-1', false);

  const [, options] = reply.mock.calls[0] as unknown as [string, Record<string, unknown>];
  return options.reply_markup;
}

async function messageFor(confidence: number): Promise<string> {
  const reply = jest.fn(async () => undefined);
  const ctx = { reply } as unknown as BotContext;

  await sendTransactionResponse(ctx, transactionWith(confidence), 'продукты 45000', 'user-1', false);

  const [message] = reply.mock.calls[0] as unknown as [string];
  return message;
}

describe('карточка транзакции', () => {
  it('показывает одинаковые кнопки при низкой и высокой уверенности', async () => {
    const low = await keyboardFor(0.2);
    const high = await keyboardFor(0.95);

    expect(low).toEqual(high);
  });

  it('не предлагает подтвердить то, что уже сохранено', async () => {
    const keyboard = JSON.stringify(await keyboardFor(0.2));

    expect(keyboard).not.toContain('confirm:');
  });

  it('но низкую уверенность из текста не прячет', async () => {
    const low = await messageFor(0.2);
    const high = await messageFor(0.95);

    expect(low).not.toBe(high);
  });
});
