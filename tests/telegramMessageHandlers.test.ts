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
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';
import { downloadVoiceFile, cleanupFile } from '../src/delivery/messaging/telegram/utils';
import { NoSpeechDetectedError } from '../src/modules/voiceProcessing/domain/voiceErrors';
import { ExternalServiceError } from '../src/shared/domain/errors/AppError';

// The voice path must not touch the filesystem or Telegram's CDN in tests; transcription itself
// stays mocked at the use-case level, so no OpenAI call is ever made.
jest.mock('../src/delivery/messaging/telegram/utils', () => ({
  downloadVoiceFile: jest.fn(),
  cleanupFile: jest.fn(),
}));

const downloadVoiceFileMock = downloadVoiceFile as jest.MockedFunction<typeof downloadVoiceFile>;
const cleanupFileMock = cleanupFile as jest.MockedFunction<typeof cleanupFile>;

const NB = ' ';
const MINUS = '−';
// What Telegram draws as an emoji picture (FT-122: the confirmation has none)
const EMOJI = /\p{Emoji_Presentation}|️/u;

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

/** The record as the database returns it: the category by its current name. */
function stored(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    userId: '131184740',
    amount: 18000,
    amountMinor: 1_800_000,
    currency: 'UZS',
    type: 'expense',
    semanticType: 'expense',
    category: 'Транспорт',
    description: 'такси',
    date: '2026-09-02',
    needsReview: false,
    ...overrides,
  };
}

/**
 * Builds the result the way QuickCaptureService would, using the *real* buildCaptureAck — the API
 * still answers with it; the bot draws its own confirmation from the stored records (FT-122).
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

/** The transaction module the handlers read the written records from. */
function recordsOf(records: Transaction[]) {
  return {
    getGetTransactionByIdUseCase: () => ({
      execute: async (id: string) => {
        const found = records.find(record => record.id === id);
        return found ? { success: true, data: found } : { success: false, error: new Error('not found') };
      },
    }),
  };
}

/** The bot's memory of its record messages (FT-122): what was remembered. */
function botMessagesLog() {
  const remember = jest.fn().mockResolvedValue({});
  return {
    remember,
    module: { getLog: () => ({ remember, awaitingAmount: jest.fn().mockResolvedValue(null) }) },
  };
}

function replyText(reply: jest.Mock, call = reply.mock.calls.length - 1): string {
  return String(reply.mock.calls[call][0]);
}

function replyLabels(reply: jest.Mock, call = reply.mock.calls.length - 1): string[][] {
  const options = reply.mock.calls[call][1] as any;
  return (options?.reply_markup?.inline_keyboard ?? []).map((row: any[]) => row.map(button => button.text));
}

describe('Telegram message handlers', () => {
  beforeEach(() => {
    // The records are dated 2 September; in another year the date would carry its year
    jest.useFakeTimers({ now: new Date('2026-09-02T09:00:00.000Z') });
    downloadVoiceFileMock.mockReset().mockResolvedValue('/tmp/voice/voice-file-1.ogg');
    cleanupFileMock.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function createTextContext(overrides: Partial<any> = {}, result?: QuickCaptureResult, records: Transaction[] = [stored()]) {
    const capture = jest.fn().mockResolvedValue(result ?? captureResult([captured()]));
    // The legacy direct parser path must stay untouched once capture is wired.
    const processTextExecute = jest.fn();
    const reply = jest.fn().mockResolvedValue({ message_id: 501, chat: { id: 131184740 } });
    const sendChatAction = jest.fn().mockResolvedValue(undefined);
    const botMessages = botMessagesLog();

    const ctx = {
      message: { text: 'такси 18к' },
      from: { id: 131184740, first_name: 'Shukur' },
      chat: { id: 131184740 },
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
        transactionModule: recordsOf(records),
        botMessageModule: botMessages.module,
      },
      ...overrides,
    };

    return { ctx, capture, processTextExecute, reply, sendChatAction, remember: botMessages.remember };
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

    it('still captures and confirms if the Telegram typing action fails', async () => {
      const failingSendChatAction = jest.fn().mockRejectedValue(new Error('chat action unavailable'));
      const { ctx, capture, reply } = createTextContext({ sendChatAction: failingSendChatAction });
      const handler = createTextMessageHandler();

      await handler(ctx as any);

      expect(failingSendChatAction).toHaveBeenCalledWith('typing');
      expect(capture).toHaveBeenCalled();
      expect(replyText(reply)).toContain('Расход');
    });

    it('says in plain words that the AI could not read the phrase, never the technical error', async () => {
      const { ctx, capture, reply } = createTextContext();
      capture.mockRejectedValue(new ExternalServiceError('OpenAI Chat', new Error('model_not_found')));
      const handler = createTextMessageHandler();

      await handler(ctx as any);

      const answer = replyText(reply);
      expect(answer).toContain('Не получилось разобрать');
      expect(answer).toContain('не записал');
      expect(answer).not.toMatch(/External service|OpenAI|❌/);
    });

    it('does not call capture for commands', async () => {
      const { ctx, capture, reply } = createTextContext({ message: { text: '/start' } });
      const handler = createTextMessageHandler();

      await handler(ctx as any);

      expect(capture).not.toHaveBeenCalled();
      expect(reply).not.toHaveBeenCalled();
    });

    it('keeps the quick-add amount flow off the capture path and confirms the record the same way', async () => {
      const { ctx, capture, reply } = createTextContext({
        message: { text: '500' },
        session: { pendingAction: { type: 'awaiting_amount', category: 'coffee' } },
      }, undefined, [stored({ id: 'tx-quick-add', amountMinor: 50_000, category: 'Кафе', description: 'Кафе' })]);
      const createExecute = jest.fn().mockResolvedValue({ success: true, data: 'tx-quick-add' });
      (ctx as any).modules.transactionModule.getCreateTransactionUseCase = () => ({ execute: createExecute });
      const handler = createTextMessageHandler();

      await handler(ctx as any);

      expect(capture).not.toHaveBeenCalled();
      expect(createExecute).toHaveBeenCalled();
      expect(replyText(reply).split('\n')[0]).toBe(`<b>Расход ${MINUS}500${NB}сум</b>`);
    });
  });

  describe('confirmation (FT-122)', () => {
    it('confirms a saved expense: bold amount, category and note, absolute date, no emoji', async () => {
      const { ctx, reply } = createTextContext();
      const handler = createTextMessageHandler();

      await handler(ctx as any);

      expect(replyText(reply)).toBe(`<b>Расход ${MINUS}18${NB}000${NB}сум</b>\nТранспорт · «Такси»\n2${NB}сентября`);
      expect(replyText(reply)).not.toMatch(EMOJI);
      expect(reply.mock.calls[0][1]).toEqual(expect.objectContaining({ parse_mode: 'HTML' }));
      expect(replyLabels(reply)).toEqual([['Изменить', 'Отменить']]);
    });

    it('remembers which records the confirmation shows, so its buttons work later', async () => {
      const result = captureResult([captured({ id: 'tx-1' }), captured({ id: 'tx-2', assumptions: [{ kind: 'category', name: 'Покупки' }] })]);
      const { ctx, remember } = createTextContext({}, result, [stored({ id: 'tx-1' }), stored({ id: 'tx-2', category: 'Покупки' })]);
      const handler = createTextMessageHandler();

      await handler(ctx as any);

      expect(remember).toHaveBeenCalledWith(expect.objectContaining({
        userId: '131184740',
        chatId: '131184740',
        messageId: 501,
        recordIds: ['tx-1', 'tx-2'],
        mode: 'confirm',
        state: expect.objectContaining({ guessed: ['tx-2'] }),
        heard: null,
      }));
    });

    it('says a record flagged for review needs checking and is not in the totals yet', async () => {
      const result = captureResult([captured({ id: 'tx-review', needsReview: true })], { text: 'оплатил за всех ужин 400000' });
      const { ctx, reply } = createTextContext({ message: { text: 'оплатил за всех ужин 400000' } }, result, [
        stored({ id: 'tx-review', amountMinor: 40_000_000, category: 'Кафе', description: 'ужин за всех', semanticType: 'group_payment', needsReview: true }),
      ]);
      const handler = createTextMessageHandler();

      await handler(ctx as any);

      expect(replyText(reply)).toContain('Нужно проверить в Daftar — пока не входит в итоги.');
    });

    it('confirms all records of one phrase in one message', async () => {
      const result = captureResult([
        captured({ id: 'tx-1', amount: 35000, description: 'кофе' }),
        captured({ id: 'tx-2', amount: 132000, description: 'продукты' }),
      ], { text: 'кофе 35000 и продукты 132000' });
      const { ctx, reply } = createTextContext({ message: { text: 'кофе 35000 и продукты 132000' } }, result, [
        stored({ id: 'tx-1', amountMinor: 3_500_000, category: 'Кафе', description: 'кофе' }),
        stored({ id: 'tx-2', amountMinor: 13_200_000, category: 'Продукты', description: 'продукты' }),
      ]);
      const handler = createTextMessageHandler();

      await handler(ctx as any);

      expect(reply).toHaveBeenCalledTimes(1);
      expect(replyText(reply)).toContain(`<b>Расходы ${MINUS}167${NB}000${NB}сум · 2 записи</b>`);
      expect(replyText(reply)).toContain(`${MINUS}35${NB}000 · Кафе · «Кофе»`);
      expect(replyText(reply)).toContain(`${MINUS}132${NB}000 · Продукты`);
    });

    it('marks a category the AI guessed with «?» (FT-138)', async () => {
      const result = captureResult([captured({ id: 'tx-uzum', description: 'Uzum', assumptions: [{ kind: 'category', name: 'Покупки' }] })]);
      const { ctx, reply } = createTextContext({}, result, [stored({ id: 'tx-uzum', category: 'Покупки', description: 'Uzum' })]);
      const handler = createTextMessageHandler();

      await handler(ctx as any);

      expect(replyText(reply)).toContain('Покупки? · «Uzum»');
    });

    it('says with an example what to write when nothing was captured (FT-123)', async () => {
      const { ctx, reply } = createTextContext({ message: { text: 'привет' } }, captureResult([], { text: 'привет' }));
      const handler = createTextMessageHandler();

      await handler(ctx as any);

      expect(replyText(reply)).toBe(
        `Не нашёл, что записать.\nНапишите трату и сумму:\n<blockquote><i>такси 18к, обед 45${NB}000 картой</i></blockquote>\n\n<i>Подробнее — /help</i>`
      );
      expect(replyText(reply)).not.toMatch(EMOJI);
    });

    it('still reports debts detected alongside the capture', async () => {
      const result = captureResult([], {
        text: 'одолжил Бобу 200000',
        debts: [{ id: 'debt-1', debtType: 'owed_to_me', personName: 'Боб', amount: 200000 }],
      });
      const { ctx, reply } = createTextContext({ message: { text: 'одолжил Бобу 200000' } }, result);
      const handler = createTextMessageHandler();

      await handler(ctx as any);

      expect(replyText(reply)).toContain('Долг записан');
      expect(replyText(reply)).toContain('Боб');
    });

    it('says an own transfer does not count as spending', async () => {
      const result = captureResult([captured({ id: 'transfer-1', semanticType: 'own_transfer', countsAsRealExpense: false })]);
      const { ctx, reply } = createTextContext({ message: { text: 'перевел 500000 на Alif' } }, result, [
        stored({ id: 'transfer-1', amountMinor: 50_000_000, category: 'Другое', description: 'перевел на Alif', semanticType: 'own_transfer' }),
      ]);
      const handler = createTextMessageHandler();

      await handler(ctx as any);

      expect(replyText(reply)).toContain('Не входит в расходы.');
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

    function createVoiceContext(overrides: Partial<any> = {}, result?: ProcessedTransaction, records: Transaction[] = [stored({ id: 'tx-voice-1' })]) {
      const voiceExecute = jest.fn().mockResolvedValue(result ?? voiceResult());
      // Voice must not be re-routed through the text capture boundary; it still needs transcription.
      const capture = jest.fn();
      const reply = jest.fn().mockResolvedValue({ message_id: 502, chat: { id: 131184740 } });
      const botMessages = botMessagesLog();
      const sendChatAction = jest.fn().mockResolvedValue(undefined);
      const getFileLink = jest.fn().mockResolvedValue({ href: 'https://telegram.example/voice.ogg' });
      const incrementUsageExecute = jest.fn().mockResolvedValue(undefined);
      const subscriptionModule = {
        getIncrementUsageUseCase: () => ({ execute: incrementUsageExecute }),
      };

      const ctx = {
        message: { voice: { file_id: 'voice-file-1' } },
        from: { id: 131184740, first_name: 'Shukur' },
        chat: { id: 131184740 },
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
          transactionModule: recordsOf(records),
          botMessageModule: botMessages.module,
        },
        ...overrides,
      };

      return {
        remember: botMessages.remember,
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
        source: 'telegram',
      }, { takeHeardText: expect.any(Function) });
      expect(capture).not.toHaveBeenCalled();
    });

    it('confirms like text and quotes what it heard', async () => {
      const { ctx, reply } = createVoiceContext();
      const handler = createVoiceMessageHandler();

      await handler(ctx as any);

      expect(replyText(reply)).toBe(
        `<b>Расход ${MINUS}18${NB}000${NB}сум</b>\nТранспорт · «Такси»\n2${NB}сентября\n`
        + '<blockquote><i>Расслышал: «такси восемнадцать тысяч»</i></blockquote>'
      );
      expect(replyText(reply)).not.toMatch(EMOJI);
      expect(replyLabels(reply)).toEqual([['Изменить', 'Отменить']]);
    });

    it('remembers what it heard, so the quote stays when the message is drawn again', async () => {
      const { ctx, remember } = createVoiceContext();
      const handler = createVoiceMessageHandler();

      await handler(ctx as any);

      expect(remember).toHaveBeenCalledWith(expect.objectContaining({ recordIds: ['tx-voice-1'], heard: 'такси восемнадцать тысяч' }));
    });

    it('confirms all records of one voice message in one message', async () => {
      const { ctx, reply } = createVoiceContext({}, voiceResult({
        text: 'кофе 35000 и продукты 132000',
        transactions: [
          detected({ id: 'tx-voice-1', amount: 35000, description: 'кофе' }),
          detected({ id: 'tx-voice-2', amount: 132000, description: 'продукты' }),
        ],
      }), [
        stored({ id: 'tx-voice-1', amountMinor: 3_500_000, category: 'Кафе', description: 'кофе' }),
        stored({ id: 'tx-voice-2', amountMinor: 13_200_000, category: 'Продукты', description: 'продукты' }),
      ]);
      const handler = createVoiceMessageHandler();

      await handler(ctx as any);

      expect(reply).toHaveBeenCalledTimes(1);
      expect(replyText(reply)).toContain('2 записи');
      expect(replyText(reply)).toContain('Расслышал: «кофе 35000 и продукты 132000»');
    });

    it('keeps semantic hints so a voice transfer does not read as a real expense', async () => {
      const { ctx, reply } = createVoiceContext({}, voiceResult({
        text: 'перевел 500000 на Alif',
        transactions: [detected({ id: 'tx-voice-transfer', semanticType: 'own_transfer' })],
      }), [stored({ id: 'tx-voice-transfer', amountMinor: 50_000_000, category: 'Другое', description: 'перевел на Alif', semanticType: 'own_transfer' })]);
      const handler = createVoiceMessageHandler();

      await handler(ctx as any);

      expect(replyText(reply)).toContain('Не входит в расходы.');
    });

    it('gives the same buttons whatever the parse confidence', async () => {
      const { ctx, reply } = createVoiceContext({}, voiceResult({
        transactions: [detected({ id: 'tx-voice-1', confidence: 0.4 })],
      }));
      const handler = createVoiceMessageHandler();

      await handler(ctx as any);

      expect(replyLabels(reply)).toEqual([['Изменить', 'Отменить']]);
      expect(replyText(reply)).not.toContain('Уверенность');
    });

    it('still reports detected debts with the voice prefix', async () => {
      const { ctx, reply } = createVoiceContext({}, voiceResult({
        text: 'одолжил Бобу 200000',
        transactions: [],
        debts: [{ id: 'debt-1', debtType: 'owed_to_me', personName: 'Боб', amount: 200000 } as DetectedDebt],
      }));
      const handler = createVoiceMessageHandler();

      await handler(ctx as any);

      expect(replyText(reply)).toContain('Долг записан');
      expect(replyText(reply)).toContain('Боб');
    });

    it('says what to write when it heard words with nothing to write, and asks again when it heard none (FT-123)', async () => {
      const notHeard = 'Не расслышал.\nСкажите ещё раз — что купили и сколько, например: «такси восемнадцать тысяч». Или напишите текстом.';
      const { ctx, reply } = createVoiceContext({}, voiceResult({
        text: 'привет, как дела',
        transactions: [],
        debts: [],
      }));
      const handler = createVoiceMessageHandler();

      await handler(ctx as any);

      expect(replyText(reply)).toBe('Не нашёл, что записать.\nНапишите трату и сумму:\n'
        + '<blockquote><i>такси 18к, обед 45\u00a0000 картой</i></blockquote>\n\n<i>Подробнее — /help</i>');
      expect(reply).toHaveBeenLastCalledWith(expect.any(String), { parse_mode: 'HTML' });

      (ctx as any).modules.voiceModule.getProcessVoiceInputUseCase = () => ({
        execute: jest.fn().mockRejectedValue(new NoSpeechDetectedError()),
      });
      await handler(ctx as any);
      expect(replyText(reply)).toBe(notHeard);
    });

    it('says in plain words that the AI could not read the voice, never the technical error', async () => {
      const { ctx, reply } = createVoiceContext();
      (ctx as any).modules.voiceModule.getProcessVoiceInputUseCase = () => ({
        execute: jest.fn().mockRejectedValue(new ExternalServiceError('OpenAI Whisper', new Error('timeout'))),
      });
      const handler = createVoiceMessageHandler();

      await handler(ctx as any);

      const answer = replyText(reply);
      expect(answer).toContain('Не получилось разобрать');
      expect(answer).not.toMatch(/External service|OpenAI|❌/);
    });

    it('counts the voice input; created transactions are counted by the create use case', async () => {
      const { ctx, subscriptionModule, incrementUsageExecute } = createVoiceContext();
      const handler = createVoiceMessageHandler(undefined, subscriptionModule as any);

      await handler(ctx as any);
      await Promise.resolve();

      expect(incrementUsageExecute).toHaveBeenCalledWith({ userId: '131184740', limitType: 'voice_inputs' });
      expect(incrementUsageExecute).not.toHaveBeenCalledWith({ userId: '131184740', limitType: 'transactions' });
    });

    it('still transcribes and confirms if the Telegram typing action fails', async () => {
      const failingSendChatAction = jest.fn().mockRejectedValue(new Error('chat action unavailable'));
      const { ctx, voiceExecute, reply } = createVoiceContext({ sendChatAction: failingSendChatAction });
      const handler = createVoiceMessageHandler();

      await handler(ctx as any);

      expect(failingSendChatAction).toHaveBeenCalledWith('typing');
      expect(voiceExecute).toHaveBeenCalled();
      expect(replyText(reply)).toContain('Расход');
    });

    it('cleans up the downloaded voice file even when processing fails', async () => {
      const { ctx, reply } = createVoiceContext();
      (ctx as any).modules.voiceModule.getProcessVoiceInputUseCase = () => ({
        execute: jest.fn().mockRejectedValue(new Error('transcription failed')),
      });
      const handler = createVoiceMessageHandler();

      await handler(ctx as any);

      expect(cleanupFileMock).toHaveBeenCalledWith('/tmp/voice/voice-file-1.ogg');
      expect(replyText(reply)).toContain('🎤');
    });

    it('cleans up the downloaded voice file after a successful capture', async () => {
      const { ctx } = createVoiceContext();
      const handler = createVoiceMessageHandler();

      await handler(ctx as any);

      expect(cleanupFileMock).toHaveBeenCalledWith('/tmp/voice/voice-file-1.ogg');
    });
  });
});
