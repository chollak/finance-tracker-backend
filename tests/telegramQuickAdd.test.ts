import { createTextMessageHandler } from '../src/delivery/messaging/telegram/handlers/messageHandlers';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';

/**
 * FT-207: after a quick-add category button the bot waits for the amount (`awaiting_amount`) and read it as
 * `parseFloat` of its digits with the first comma for a point: «150,000» was 150 сум, «1,500» 1,5. Now it reads the
 * amount as the answer to «Сколько?» reads it (`parseAmountReply`): «150,000» and «150к» are 150 000, a bare
 * number under a thousand is thousands of сум and the bot says so, сумы are whole, «$» and «нал» count.
 *
 * Only a `quickadd:` button of a message sent before FT-124 (2026-10-20) opens this: no keyboard sends one since,
 * and the session that waits is in memory, so a restart closes it.
 */
const NB = ' ';
const MINUS = '−';

function quickAddContext(text: string) {
  let written: Transaction | undefined;
  const create = jest.fn(async (record: Transaction, _options?: unknown) => {
    written = record;
    return { success: true, data: 'tx-quick-add' };
  });
  const reply = jest.fn().mockResolvedValue({ message_id: 501, chat: { id: 131184740 } });
  const session: Record<string, unknown> = { pendingAction: { type: 'awaiting_amount', category: 'coffee' } };
  const ctx = {
    message: { text },
    from: { id: 131184740, first_name: 'Shukur' },
    chat: { id: 131184740 },
    session,
    reply,
    sendChatAction: jest.fn().mockResolvedValue(undefined),
    modules: {
      transactionModule: {
        getCreateTransactionUseCase: () => ({ execute: create }),
        // The record as the database returns it
        getGetTransactionByIdUseCase: () => ({
          execute: async (id: string) => ({
            success: true,
            data: {
              id,
              userId: '131184740',
              ...written,
              amount: (written?.amountMinor ?? 0) / 100,
              type: 'expense',
              semanticType: 'expense',
              category: 'Кафе',
              description: 'Кафе',
              date: '2026-10-31',
              needsReview: false,
            },
          }),
        }),
      },
      botMessageModule: { getLog: () => ({ remember: jest.fn().mockResolvedValue({}), awaitingAmount: jest.fn().mockResolvedValue(null) }) },
    },
  };
  return { ctx, create, reply, session };
}

async function sendAmount(text: string) {
  const context = quickAddContext(text);
  await createTextMessageHandler()(context.ctx as any);
  return context;
}

const lastReply = (reply: jest.Mock): string => String(reply.mock.calls[reply.mock.calls.length - 1][0]);

describe('the amount after a quick-add category (FT-207)', () => {
  it.each([
    ['150,000', 15_000_000],
    ['1,500', 150_000],
    ['28 000,00', 2_800_000],
    ['150к', 15_000_000],
    ['25к', 2_500_000],
    ['150 000', 15_000_000],
    ['25.000', 2_500_000],
    ['1 234,50', 123_500],
  ])('«%s» is %i minor units of сум', async (text, amountMinor) => {
    const { create, session } = await sendAmount(text);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toEqual(expect.objectContaining({ amountMinor, currency: 'UZS' }));
    expect(session.pendingAction).toBeUndefined();
  });

  it('reads a bare «500» as 500 000 сум, and says it did', async () => {
    const { create, reply } = await sendAmount('500');

    expect(create.mock.calls[0][0]).toEqual(expect.objectContaining({ amountMinor: 50_000_000, currency: 'UZS' }));
    expect(lastReply(reply)).toContain(`<b>Расход ${MINUS}500${NB}000${NB}сум</b>`);
    expect(lastReply(reply)).toContain(`«500» понял как 500${NB}000${NB}сум.`);
  });

  it('writes «60$» in dollars and «18к нал» on a cash account', async () => {
    const dollars = await sendAmount('60$');
    const cash = await sendAmount('18к нал');

    expect(dollars.create.mock.calls[0][0]).toEqual(expect.objectContaining({ amountMinor: 6_000, currency: 'USD' }));
    expect(cash.create.mock.calls[0][0]).toEqual(expect.objectContaining({ amountMinor: 1_800_000, currency: 'UZS' }));
    expect(cash.create.mock.calls[0][1]).toEqual(expect.objectContaining({ accountHint: { kind: 'cash' } }));
  });

  it.each([
    ['0', 'Сумма должна быть больше нуля.'],
    ['-5000', 'Сумма должна быть больше нуля.'],
    ['99999999 млрд', 'Сумма слишком большая — проверьте её и напишите ещё раз.'],
  ])('writes nothing for «%s» and keeps waiting', async (text, answer) => {
    const { create, reply, session } = await sendAmount(text);

    expect(create).not.toHaveBeenCalled();
    expect(lastReply(reply)).toBe(answer);
    expect(session.pendingAction).toEqual({ type: 'awaiting_amount', category: 'coffee' });
  });

  it('writes nothing for a text that is not an amount and asks for one', async () => {
    const { create, reply, session } = await sendAmount('кофе 25000');

    expect(create).not.toHaveBeenCalled();
    expect(lastReply(reply)).toContain('Например: <b>25к</b> или <b>25 000</b>');
    expect(session.pendingAction).toEqual({ type: 'awaiting_amount', category: 'coffee' });
  });
});
