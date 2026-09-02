import {
  createTextMessageHandler,
  createVoiceMessageHandler,
} from '../src/delivery/messaging/telegram/handlers/messageHandlers';
import { buildCaptureAck } from '../src/modules/quickCapture/application/buildCaptureAck';
import { CapturedTransaction, QuickCaptureResult } from '../src/modules/quickCapture/domain/quickCaptureTypes';
import {
  DetectedDebt,
  DetectedTransaction,
  ProcessedTransaction,
} from '../src/modules/voiceProcessing/domain/processedTransaction';
import { downloadVoiceFile, cleanupFile } from '../src/delivery/messaging/telegram/utils';

// The voice path must not touch the filesystem or Telegram's CDN in tests; transcription itself
// stays mocked at the use-case level, so no OpenAI call is ever made.
jest.mock('../src/delivery/messaging/telegram/utils', () => ({
  downloadVoiceFile: jest.fn(),
  cleanupFile: jest.fn(),
}));

const downloadVoiceFileMock = downloadVoiceFile as jest.MockedFunction<typeof downloadVoiceFile>;
const cleanupFileMock = cleanupFile as jest.MockedFunction<typeof cleanupFile>;

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
  beforeEach(() => {
    downloadVoiceFileMock.mockReset().mockResolvedValue('/tmp/voice/voice-file-1.ogg');
    cleanupFileMock.mockReset().mockResolvedValue(undefined);
  });

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

  describe('voice capture', () => {
    function detected(overrides: Partial<DetectedTransaction> = {}): DetectedTransaction {
      return {
        id: 'tx-voice-1',
        amount: 18000,
        category: 'transport',
        type: 'expense',
        semanticType: 'expense',
        needsReview: false,
        date: '2026-09-02',
        confidence: 1,
        description: 'такси',
        ...overrides,
      };
    }

    function voiceResult(overrides: Partial<ProcessedTransaction> = {}): ProcessedTransaction {
      return {
        text: 'такси восемнадцать тысяч',
        transactions: [detected()],
        debts: [],
        ...overrides,
      };
    }

    function createVoiceContext(overrides: Partial<any> = {}, result?: ProcessedTransaction) {
      const voiceExecute = jest.fn().mockResolvedValue(result ?? voiceResult());
      // Voice must not be re-routed through the text capture boundary; it still needs transcription.
      const capture = jest.fn();
      const reply = jest.fn().mockResolvedValue(undefined);
      const sendChatAction = jest.fn().mockResolvedValue(undefined);
      const getUserTransactionsExecute = jest.fn().mockResolvedValue([]);
      const getFileLink = jest.fn().mockResolvedValue({ href: 'https://telegram.example/voice.ogg' });
      const incrementUsageExecute = jest.fn().mockResolvedValue(undefined);
      const subscriptionModule = {
        getIncrementUsageUseCase: () => ({ execute: incrementUsageExecute }),
      };

      const ctx = {
        message: { voice: { file_id: 'voice-file-1' } },
        from: { id: 131184740, first_name: 'Shukur' },
        session: {},
        reply,
        sendChatAction,
        telegram: { getFileLink },
        modules: {
          quickCaptureModule: {
            getQuickCaptureService: () => ({ capture }),
          },
          voiceModule: {
            getProcessVoiceInputUseCase: () => ({ execute: voiceExecute }),
          },
          transactionModule: {
            getGetUserTransactionsUseCase: () => ({ execute: getUserTransactionsExecute }),
          },
        },
        ...overrides,
      };

      return {
        ctx,
        voiceExecute,
        capture,
        reply,
        sendChatAction,
        getFileLink,
        subscriptionModule,
        incrementUsageExecute,
      };
    }

    function lastReplyText(reply: jest.Mock): string {
      return String(reply.mock.calls[reply.mock.calls.length - 1][0]);
    }

    function callbackData(reply: jest.Mock, callIndex = 0): string[] {
      const options = reply.mock.calls[callIndex][1] as any;
      return (options.reply_markup?.inline_keyboard ?? [])
        .flat()
        .map((button: any) => button.callback_data)
        .filter(Boolean);
    }

    it('still downloads and transcribes through the existing voice use case', async () => {
      const { ctx, voiceExecute, capture, getFileLink } = createVoiceContext();
      const handler = createVoiceMessageHandler();

      await handler(ctx as any);

      expect(getFileLink).toHaveBeenCalledWith('voice-file-1');
      expect(downloadVoiceFileMock).toHaveBeenCalledWith('https://telegram.example/voice.ogg', 'voice-file-1');
      expect(voiceExecute).toHaveBeenCalledWith({
        filePath: '/tmp/voice/voice-file-1.ogg',
        userId: '131184740',
        userName: 'Shukur',
      });
      expect(capture).not.toHaveBeenCalled();
    });

    it('replies with the shared quick capture ack carrying the voice prefix', async () => {
      const { ctx, reply } = createVoiceContext();
      const handler = createVoiceMessageHandler();

      await handler(ctx as any);

      const message = lastReplyText(reply);
      expect(message).toContain('🎤✅ <b>Записал</b>');
      expect(message).toContain('Такси · 18 000 сум');
    });

    it('renders one ack per transaction for a multi-item voice capture', async () => {
      const { ctx, reply } = createVoiceContext({}, voiceResult({
        text: 'кофе 35000 и продукты 132000',
        transactions: [
          detected({ id: 'tx-voice-1', amount: 35000, category: 'coffee', description: 'кофе' }),
          detected({ id: 'tx-voice-2', amount: 132000, category: 'groceries', description: 'продукты' }),
        ],
      }));
      const handler = createVoiceMessageHandler();

      await handler(ctx as any);

      expect(reply).toHaveBeenCalledTimes(2);
      expect(String(reply.mock.calls[0][0])).toContain('Кофе · 35 000 сум');
      expect(String(reply.mock.calls[1][0])).toContain('Продукты · 132 000 сум');
    });

    it('keeps semantic hints so a voice transfer does not read as a real expense', async () => {
      const { ctx, reply } = createVoiceContext({}, voiceResult({
        text: 'перевел 500000 на Alif',
        transactions: [detected({
          id: 'tx-voice-transfer',
          amount: 500000,
          category: 'transfer',
          semanticType: 'own_transfer',
          description: 'перевел на Alif',
        })],
      }));
      const handler = createVoiceMessageHandler();

      await handler(ctx as any);

      const message = lastReplyText(reply);
      expect(message).toContain('↔️ Перевод себе');
      expect(message).toContain('Не входит в расходы');
    });

    it('surfaces the needsReview cue for a flagged voice capture', async () => {
      const { ctx, reply } = createVoiceContext({}, voiceResult({
        text: 'оплатил за всех ужин 400000',
        transactions: [detected({
          id: 'tx-voice-review',
          amount: 400000,
          category: 'restaurants',
          semanticType: 'group_payment',
          description: 'ужин за всех',
          needsReview: true,
        })],
      }));
      const handler = createVoiceMessageHandler();

      await handler(ctx as any);

      const message = lastReplyText(reply);
      expect(message).toContain('🎤⚠️ <b>Нужно проверить</b>');
      expect(message).toContain('⚠️ Нужно проверить в Mini App');
      expect(message).not.toContain('<b>Записал</b>');
    });

    it('keeps the confirm keyboard when voice parse confidence is low', async () => {
      const { ctx, reply } = createVoiceContext({}, voiceResult({
        transactions: [detected({ id: 'tx-voice-low', confidence: 0.4 })],
      }));
      const handler = createVoiceMessageHandler();

      await handler(ctx as any);

      const message = lastReplyText(reply);
      expect(message).toContain('🎤🤔 <b>Подтвердите</b>');
      expect(message).toContain('⚠️ Уверенность: 40%');
      expect(callbackData(reply as jest.Mock)).toContain('confirm:tx-voice-low');
    });

    it('uses the auto-saved keyboard when voice parse confidence is high', async () => {
      const { ctx, reply } = createVoiceContext();
      const handler = createVoiceMessageHandler();

      await handler(ctx as any);

      const data = callbackData(reply as jest.Mock);
      expect(data).toContain('edit:tx-voice-1');
      expect(data).toContain('delete:tx-voice-1');
      expect(data).not.toContain('confirm:tx-voice-1');
    });

    it('appends today/month totals to the voice ack', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-31T12:00:00.000Z'));

      const { ctx, reply } = createVoiceContext({
        modules: {
          quickCaptureModule: { getQuickCaptureService: () => ({ capture: jest.fn() }) },
          voiceModule: {
            getProcessVoiceInputUseCase: () => ({ execute: jest.fn().mockResolvedValue(voiceResult()) }),
          },
          transactionModule: {
            getGetUserTransactionsUseCase: () => ({
              execute: jest.fn().mockResolvedValue([
                { amount: 45000, type: 'expense', semanticType: 'expense', needsReview: false, date: '2026-07-31T10:00:00.000Z' },
                { amount: 500000, type: 'expense', semanticType: 'own_transfer', needsReview: false, date: '2026-07-31T11:00:00.000Z' },
              ]),
            }),
          },
        },
      });
      const handler = createVoiceMessageHandler();

      await handler(ctx as any);

      const message = lastReplyText(reply);
      expect(message).toContain('Сегодня: 45 000 UZS');
      expect(message).toContain('Месяц: 45 000 UZS');

      jest.useRealTimers();
    });

    it('still reports detected debts with the voice prefix', async () => {
      const { ctx, reply } = createVoiceContext({}, voiceResult({
        text: 'одолжил Бобу 200000',
        transactions: [],
        debts: [{ id: 'debt-1', debtType: 'owed_to_me', personName: 'Боб', amount: 200000 } as DetectedDebt],
      }));
      const handler = createVoiceMessageHandler();

      await handler(ctx as any);

      const message = lastReplyText(reply);
      expect(message).toContain('🎤');
      expect(message).toContain('Долг записан');
      expect(message).toContain('Боб');
    });

    it('reports no transaction found without an ack', async () => {
      const { ctx, reply } = createVoiceContext({}, voiceResult({
        text: 'привет',
        transactions: [],
        debts: [],
      }));
      const handler = createVoiceMessageHandler();

      await handler(ctx as any);

      expect(lastReplyText(reply)).toBe('🎤 Транзакций не найдено');
    });

    it('increments voice and transaction usage after a successful capture', async () => {
      const { ctx, subscriptionModule, incrementUsageExecute } = createVoiceContext();
      const handler = createVoiceMessageHandler(undefined, subscriptionModule as any);

      await handler(ctx as any);
      await Promise.resolve();

      expect(incrementUsageExecute).toHaveBeenCalledWith({ userId: '131184740', limitType: 'voice_inputs' });
      expect(incrementUsageExecute).toHaveBeenCalledWith({ userId: '131184740', limitType: 'transactions' });
    });

    it('still transcribes and acknowledges if the Telegram typing action fails', async () => {
      const failingSendChatAction = jest.fn().mockRejectedValue(new Error('chat action unavailable'));
      const { ctx, voiceExecute, reply } = createVoiceContext({ sendChatAction: failingSendChatAction });
      const handler = createVoiceMessageHandler();

      await handler(ctx as any);

      expect(failingSendChatAction).toHaveBeenCalledWith('typing');
      expect(voiceExecute).toHaveBeenCalled();
      expect(lastReplyText(reply)).toContain('Записал');
    });

    it('cleans up the downloaded voice file even when processing fails', async () => {
      const { ctx, reply } = createVoiceContext();
      (ctx as any).modules.voiceModule.getProcessVoiceInputUseCase = () => ({
        execute: jest.fn().mockRejectedValue(new Error('transcription failed')),
      });
      const handler = createVoiceMessageHandler();

      await handler(ctx as any);

      expect(cleanupFileMock).toHaveBeenCalledWith('/tmp/voice/voice-file-1.ogg');
      expect(lastReplyText(reply)).toContain('🎤');
    });

    it('cleans up the downloaded voice file after a successful capture', async () => {
      const { ctx } = createVoiceContext();
      const handler = createVoiceMessageHandler();

      await handler(ctx as any);

      expect(cleanupFileMock).toHaveBeenCalledWith('/tmp/voice/voice-file-1.ogg');
    });
  });
});
