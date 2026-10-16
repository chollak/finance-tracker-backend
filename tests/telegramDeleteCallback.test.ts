import { registerCallbackHandlers } from '../src/delivery/messaging/telegram/handlers/callbackHandlers';
import {
  createTextMessageHandler,
  clearLastTransactionId,
} from '../src/delivery/messaging/telegram/handlers/messageHandlers';
import { buildCaptureAck } from '../src/modules/quickCapture/application/buildCaptureAck';
import { CapturedTransaction, QuickCaptureResult } from '../src/modules/quickCapture/domain/quickCaptureTypes';
import { RU } from '../src/delivery/messaging/telegram/i18n/ru';

const TELEGRAM_ID = 131184740;
const USER_UUID = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b';

function captured(id: string): CapturedTransaction {
  return {
    id,
    amount: 18000,
    type: 'expense',
    semanticType: 'expense',
    category: 'transport',
    description: 'такси',
    date: '2026-10-14',
    confidence: 1,
    needsReview: false,
    countsAsRealExpense: true,
  };
}

function captureResult(id: string): QuickCaptureResult {
  const transactions = [captured(id)];
  return {
    status: 'saved',
    text: 'такси 18к',
    source: 'telegram',
    transactions,
    debts: [],
    ack: buildCaptureAck(transactions, { debtsDetected: 0 }),
    review: { reasons: [] },
  };
}

/** The bot resolves telegram ids to UUIDs, exactly like production does with a UserModule. */
const userModule = {
  getGetOrCreateUserUseCase: () => ({
    execute: jest.fn().mockResolvedValue({ id: USER_UUID }),
  }),
} as any;

async function recordTransaction(id: string) {
  const ctx = {
    message: { text: 'такси 18к' },
    from: { id: TELEGRAM_ID, first_name: 'Shukur' },
    session: {},
    reply: jest.fn().mockResolvedValue(undefined),
    sendChatAction: jest.fn().mockResolvedValue(undefined),
    modules: {
      quickCaptureModule: {
        getQuickCaptureService: () => ({ capture: jest.fn().mockResolvedValue(captureResult(id)) }),
      },
      transactionModule: {
        getGetUserTransactionsUseCase: () => ({ execute: jest.fn().mockResolvedValue([]) }),
      },
    },
  };

  await createTextMessageHandler(userModule)(ctx as any);
}

function deleteHandler(): (ctx: any) => Promise<void> {
  const actions: Array<{ trigger: unknown; handler: (ctx: any) => Promise<void> }> = [];
  const bot = {
    action: jest.fn((trigger: unknown, handler: (ctx: any) => Promise<void>) => {
      actions.push({ trigger, handler });
    }),
  };

  registerCallbackHandlers(bot as any);

  const found = actions.find(({ trigger }) => trigger instanceof RegExp && trigger.source.startsWith('^delete:'));
  if (!found) throw new Error('delete callback is not registered');
  return found.handler;
}

function deleteContext(transactionId: string, result: unknown = { success: true, data: undefined }) {
  const execute = jest.fn().mockResolvedValue(result);
  const ctx = {
    match: [`delete:${transactionId}`, transactionId],
    from: { id: TELEGRAM_ID },
    answerCbQuery: jest.fn().mockResolvedValue(undefined),
    editMessageReplyMarkup: jest.fn().mockResolvedValue(undefined),
    modules: {
      transactionModule: {
        getDeleteTransactionUseCase: () => ({ execute }),
      },
    },
  };
  return { ctx, execute };
}

describe('Telegram «Удалить» button', () => {
  afterEach(() => {
    clearLastTransactionId(String(TELEGRAM_ID));
    clearLastTransactionId(USER_UUID);
  });

  it('deletes the last recorded transaction and removes the buttons', async () => {
    await recordTransaction('tx-1');
    const { ctx, execute } = deleteContext('tx-1');

    await deleteHandler()(ctx);

    expect(execute).toHaveBeenCalledWith({ id: 'tx-1' });
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalledWith(undefined);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(`✅ ${RU.transaction.deleted}`);
  });

  it('refuses to delete a transaction that is not the last one', async () => {
    await recordTransaction('tx-1');
    await recordTransaction('tx-2');
    const { ctx, execute } = deleteContext('tx-1');

    await deleteHandler()(ctx);

    expect(execute).not.toHaveBeenCalled();
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(RU.errors.cannotDelete);
  });

  it('does not report success when the delete fails, and lets the user retry', async () => {
    await recordTransaction('tx-1');
    const failed = deleteContext('tx-1', { success: false, error: new Error('database is locked') });

    await deleteHandler()(failed.ctx);

    expect(failed.ctx.editMessageReplyMarkup).not.toHaveBeenCalled();
    expect(failed.ctx.answerCbQuery).toHaveBeenCalledWith(RU.errors.generic);

    const retry = deleteContext('tx-1');
    await deleteHandler()(retry.ctx);

    expect(retry.execute).toHaveBeenCalledWith({ id: 'tx-1' });
    expect(retry.ctx.answerCbQuery).toHaveBeenCalledWith(`✅ ${RU.transaction.deleted}`);
  });
});
