import { createTextMessageHandler } from '../src/delivery/messaging/telegram/handlers/messageHandlers';
import { buildCaptureAck } from '../src/modules/quickCapture/application/buildCaptureAck';
import { CapturedTransaction, QuickCaptureResult } from '../src/modules/quickCapture/domain/quickCaptureTypes';
import { DetectedDebt } from '../src/modules/voiceProcessing/domain/processedTransaction';

function captured(overrides: Partial<CapturedTransaction> = {}): CapturedTransaction {
  return {
    id: 'tx-1',
    amount: 18000,
    type: 'expense',
    semanticType: 'expense',
    category: 'transport',
    description: 'такси',
    date: '2026-09-02',
    confidence: 1,
    needsReview: false,
    countsAsRealExpense: true,
    ...overrides,
  };
}

/**
 * Builds the result the way QuickCaptureService would, using the *real* buildCaptureAck so
 * these tests fail if Telegram stops rendering the shared ack.
 */
function captureResult(
  transactions: CapturedTransaction[],
  extra: { debts?: DetectedDebt[]; text?: string } = {}
): QuickCaptureResult {
  const debts = extra.debts ?? [];
  const needsReview = transactions.some(transaction => transaction.needsReview);

  return {
    status: transactions.length === 0
      ? (debts.length > 0 ? 'needs_review' : 'no_transaction')
      : (needsReview ? 'needs_review' : 'saved'),
    text: extra.text ?? 'такси 18к',
    source: 'telegram',
    transactions,
    debts,
    ack: buildCaptureAck(transactions, { debtsDetected: debts.length }),
    review: { reasons: needsReview ? ['transaction_needs_review'] : [] },
  };
}

describe('Telegram message handlers', () => {
  function createTextContext(overrides: Partial<any> = {}, result?: QuickCaptureResult) {
    const capture = jest.fn().mockResolvedValue(result ?? captureResult([captured()]));
    // The legacy direct parser path must stay untouched once capture is wired.
    const processTextExecute = jest.fn();
    const reply = jest.fn().mockResolvedValue(undefined);
    const sendChatAction = jest.fn().mockResolvedValue(undefined);
    const getUserTransactionsExecute = jest.fn().mockResolvedValue([]);

    const ctx = {
      message: { text: 'такси 18к' },
      from: { id: 131184740, first_name: 'Shukur' },
      session: {},
      reply,
      sendChatAction,
      modules: {
        quickCaptureModule: {
          getQuickCaptureService: () => ({ capture }),
        },
        voiceModule: {
          getProcessTextInputUseCase: () => ({ execute: processTextExecute }),
        },
        transactionModule: {
          getGetUserTransactionsUseCase: () => ({ execute: getUserTransactionsExecute }),
        },
      },
      ...overrides,
    };

    return { ctx, capture, processTextExecute, reply, sendChatAction, getUserTransactionsExecute };
  }

  function lastReplyText(reply: jest.Mock): string {
    return String(reply.mock.calls[reply.mock.calls.length - 1][0]);
  }

  describe('quick capture routing', () => {
    it('sends ordinary finance text through QuickCaptureService with the telegram source', async () => {
      const { ctx, capture, processTextExecute } = createTextContext();
      const handler = createTextMessageHandler();

      await handler(ctx as any);

      expect(capture).toHaveBeenCalledWith({
        text: 'такси 18к',
        userId: '131184740',
        userName: 'Shukur',
        source: 'telegram',
      });
      expect(processTextExecute).not.toHaveBeenCalled();
    });

    it('shows Telegram typing action before the slow capture call', async () => {
      const { ctx, capture, sendChatAction } = createTextContext();
      const handler = createTextMessageHandler();

      await handler(ctx as any);

      expect(sendChatAction).toHaveBeenCalledWith('typing');
      expect(sendChatAction.mock.invocationCallOrder[0]).toBeLessThan(capture.mock.invocationCallOrder[0]);
    });

    it('still captures and acknowledges if the Telegram typing action fails', async () => {
      const failingSendChatAction = jest.fn().mockRejectedValue(new Error('chat action unavailable'));
      const { ctx, capture, reply } = createTextContext({ sendChatAction: failingSendChatAction });
      const handler = createTextMessageHandler();

      await handler(ctx as any);

      expect(failingSendChatAction).toHaveBeenCalledWith('typing');
      expect(capture).toHaveBeenCalled();
      expect(lastReplyText(reply)).toContain('Записал');
    });

    it('does not call capture for commands', async () => {
      const { ctx, capture, reply } = createTextContext({ message: { text: '/start' } });
      const handler = createTextMessageHandler();

      await handler(ctx as any);

      expect(capture).not.toHaveBeenCalled();
      expect(reply).not.toHaveBeenCalled();
    });

    it('keeps the quick-add amount flow off the capture path', async () => {
      const { ctx, capture } = createTextContext({
        message: { text: '500' },
        session: { pendingAction: { type: 'awaiting_amount', category: 'coffee' } },
      });
      const createExecute = jest.fn().mockResolvedValue({ success: true, data: 'tx-quick-add' });
      (ctx as any).modules.transactionModule.getCreateTransactionUseCase = () => ({ execute: createExecute });
      const handler = createTextMessageHandler();

      await handler(ctx as any);

      expect(capture).not.toHaveBeenCalled();
      expect(createExecute).toHaveBeenCalled();
    });
  });

  describe('acknowledgement', () => {
    it('replies with the shared quick capture ack for a saved expense', async () => {
      const { ctx, reply } = createTextContext();
      const handler = createTextMessageHandler();

      await handler(ctx as any);

      const message = lastReplyText(reply);
      expect(message).toContain('✅ <b>Записал</b>');
      expect(message).toContain('Такси · 18 000 сум');
    });

    it('says the capture needs checking when the parse is flagged for review', async () => {
      const result = captureResult([captured({
        id: 'tx-review',
        amount: 400000,
        category: 'restaurants',
        semanticType: 'group_payment',
        description: 'ужин за всех',
        needsReview: true,
        countsAsRealExpense: false,
      })], { text: 'оплатил за всех ужин 400000' });
      const { ctx, reply } = createTextContext({ message: { text: 'оплатил за всех ужин 400000' } }, result);
      const handler = createTextMessageHandler();

      await handler(ctx as any);

      const message = lastReplyText(reply);
      expect(message).toContain('Нужно проверить');
      expect(message).not.toContain('<b>Записал</b>');
    });

    it('replies once per transaction for a multi-item capture', async () => {
      const result = captureResult([
        captured({ id: 'tx-1', amount: 35000, category: 'coffee', description: 'кофе' }),
        captured({ id: 'tx-2', amount: 132000, category: 'groceries', description: 'продукты' }),
      ], { text: 'кофе 35000 и продукты 132000' });
      const { ctx, reply } = createTextContext({ message: { text: 'кофе 35000 и продукты 132000' } }, result);
      const handler = createTextMessageHandler();

      await handler(ctx as any);

      expect(reply).toHaveBeenCalledTimes(2);
      expect(String(reply.mock.calls[0][0])).toContain('Кофе · 35 000 сум');
      expect(String(reply.mock.calls[1][0])).toContain('Продукты · 132 000 сум');
    });

    it('reports no transaction without an ack when nothing was captured', async () => {
      const { ctx, reply } = createTextContext({ message: { text: 'привет' } }, captureResult([], { text: 'привет' }));
      const handler = createTextMessageHandler();

      await handler(ctx as any);

      expect(lastReplyText(reply)).toBe('Транзакций не найдено');
    });

    it('still reports debts detected alongside the capture', async () => {
      const result = captureResult([], {
        text: 'одолжил Бобу 200000',
        debts: [{ id: 'debt-1', debtType: 'owed_to_me', personName: 'Боб', amount: 200000 }],
      });
      const { ctx, reply } = createTextContext({ message: { text: 'одолжил Бобу 200000' } }, result);
      const handler = createTextMessageHandler();

      await handler(ctx as any);

      const message = lastReplyText(reply);
      expect(message).toContain('Долг записан');
      expect(message).toContain('Боб');
    });
  });

  describe('semantic safeguards', () => {
    it('presents an own transfer as a transfer, not as a real expense', async () => {
      const result = captureResult([captured({
        id: 'transfer-1',
        amount: 500000,
        category: 'transfer',
        semanticType: 'own_transfer',
        description: 'перевел на Alif',
        countsAsRealExpense: false,
      })], { text: 'перевел 500000 на Alif' });
      const { ctx, reply } = createTextContext({ message: { text: 'перевел 500000 на Alif' } }, result);
      const handler = createTextMessageHandler();

      await handler(ctx as any);

      const message = lastReplyText(reply);
      expect(message).toContain('Перевод себе');
      expect(message).toContain('Не входит в расходы');
    });

    it('excludes semantic non-expenses and needsReview transactions from Telegram daily/month totals', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-31T12:00:00.000Z'));

      const result = captureResult([captured({
        id: 'transfer-1',
        amount: 500000,
        category: 'transfer',
        semanticType: 'own_transfer',
        description: 'перевел на Alif',
        countsAsRealExpense: false,
      })], { text: 'перевел 500000 на Alif' });
      const getUserTransactionsExecute = jest.fn().mockResolvedValue([
        { amount: 45000, type: 'expense', semanticType: 'expense', needsReview: false, date: '2026-07-31T10:00:00.000Z' },
        { amount: 500000, type: 'expense', semanticType: 'own_transfer', needsReview: false, date: '2026-07-31T11:00:00.000Z' },
        { amount: 400000, type: 'expense', semanticType: 'expense', needsReview: true, date: '2026-07-31T11:30:00.000Z' },
      ]);
      const capture = jest.fn().mockResolvedValue(result);
      const { ctx, reply } = createTextContext({
        message: { text: 'перевел 500000 на Alif' },
        modules: {
          quickCaptureModule: { getQuickCaptureService: () => ({ capture }) },
          voiceModule: { getProcessTextInputUseCase: () => ({ execute: jest.fn() }) },
          transactionModule: {
            getGetUserTransactionsUseCase: () => ({ execute: getUserTransactionsExecute }),
          },
        },
      });
      const handler = createTextMessageHandler();

      await handler(ctx as any);

      const message = lastReplyText(reply);
      expect(message).toContain('Сегодня: 45 000 UZS');
      expect(message).toContain('Месяц: 45 000 UZS');
      expect(message).not.toContain('Сегодня: 545 000 UZS');
      expect(message).not.toContain('Месяц: 945 000 UZS');

      jest.useRealTimers();
    });
  });
});
