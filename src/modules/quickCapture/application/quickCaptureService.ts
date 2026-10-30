import { ProcessTextInputUseCase } from '../../voiceProcessing/application/processTextInput';
import { RecordPaymentUseCase } from '../../voiceProcessing/application/recordPayment';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { ErrorFactory } from '../../../shared/domain/errors/AppError';
import { buildCaptureAck } from './buildCaptureAck';
import { capturedFromRecord, toCapturedTransaction } from './toCapturedTransaction';
import { CAPTURED_AT_LIMITS, capturedAtProblem, inputDayOf } from '../domain/capturedAt';
import { todayDateOnly } from '../../../shared/domain/dates/dateOnly';
import { APPLE_PAY_SOURCE, RecordSource } from '../../transaction/domain/recordSource';
import { Transaction } from '../../transaction/domain/transactionEntity';
import {
  AmountAnswerRequest,
  CaptureReplay,
  CaptureReviewReason,
  CapturedDebt,
  CapturedTransaction,
  PaymentCaptureRequest,
  QuickCaptureRequest,
  QuickCaptureResult,
  QuickCaptureStatus,
} from '../domain/quickCaptureTypes';

const logger = getLogger(LogCategory.TRANSACTION);

const CAPTURED_AT_TOO_OLD = `capturedAt is older than ${CAPTURED_AT_LIMITS.ageMs / 86_400_000} days`;

/**
 * The shared quick-capture boundary. It owns the client-facing contract (status + ack)
 * and nothing else: parsing, the conservative transfer/savings/withdrawal safeguards and
 * persistence all stay inside ProcessTextInputUseCase, which this service only wraps.
 */
export class QuickCaptureService {
  /** Captures with a clientId still being parsed, so a retry waits for them instead of parsing again. */
  private inFlight = new Map<string, Promise<QuickCaptureResult>>();

  constructor(
    private processTextInputUseCase: ProcessTextInputUseCase,
    private replay?: CaptureReplay,
    /** The server's clock, for the limits of `capturedAt`. */
    private now: () => Date = () => new Date(),
    /** Writes a payment the iOS app sends ready (FT-176). */
    private recordPayment?: RecordPaymentUseCase
  ) {}

  async capture(request: QuickCaptureRequest): Promise<QuickCaptureResult> {
    return this.once(request.userId, request.clientId, () => this.captureOnce(request));
  }

  /**
   * A card payment from Apple Pay, written as it came (FT-176): the same repeats and time of input as a phrase, and no
   * parser — only the category is chosen, by the merchant.
   */
  async capturePayment(request: PaymentCaptureRequest): Promise<QuickCaptureResult> {
    return this.once(request.userId, request.clientId, () => this.capturePaymentOnce(request));
  }

  /**
   * A retry that arrives while the first request is still being written (a client timeout) waits for it: two parses of
   * one text may differ, and their records must not mix (FT-106).
   */
  private once(userId: string, clientId: string | undefined, capture: () => Promise<QuickCaptureResult>): Promise<QuickCaptureResult> {
    if (!clientId) return capture();
    const key = `${userId}\u0000${clientId}`;
    const running = this.inFlight.get(key);
    if (running) return running.then(result => ({ ...result, repeated: true }));
    const first = capture().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, first);
    return first;
  }

  private async capturePaymentOnce(request: PaymentCaptureRequest): Promise<QuickCaptureResult> {
    const text = request.merchant ?? '';
    const earlier = await this.earlierRecords(request.userId, request.clientId);
    // The clientId may be a phrase's or a form's too: the answer says where the record found came from
    if (earlier) return { ...buildResult(text, earlier[0].source ?? APPLE_PAY_SOURCE, earlier.map(capturedFromRecord), []), repeated: true };

    if (!this.recordPayment) throw ErrorFactory.configuration('Payments are not wired into quick capture');
    const written = await this.recordPayment.execute({
      userId: request.userId,
      userName: request.userName,
      amountMinor: request.amountMinor,
      currency: request.currency,
      merchant: request.merchant,
      accountName: request.accountName,
      clientId: request.clientId,
      // Checked after the repeat, as for a phrase (FT-175)
      date: request.capturedAt ? this.inputDay(request.capturedAt) : todayDateOnly(this.now()),
    });
    if (!written.success) throw written.error;

    const result = buildResult(text, APPLE_PAY_SOURCE, [toCapturedTransaction(written.data)], []);
    // The merchant and the account are the user's data: only what was given and what came out are logged
    logger.info('Payment captured', {
      currency: request.currency,
      status: result.status,
      merchant: Boolean(request.merchant),
      accountName: Boolean(request.accountName),
    });
    return result;
  }

  /** What the first capture with this client id wrote, for its repeat (FT-106); null when there is none. */
  private async earlierRecords(userId: string, clientId: string | undefined): Promise<Transaction[] | null> {
    if (!clientId || !this.replay) return null;
    const earlier = await this.replay.findByClientId(userId, clientId);
    if (earlier.length === 0) return null;
    logger.info('Quick capture repeated', { transactions: earlier.length });
    return earlier;
  }

  private async captureOnce(request: QuickCaptureRequest): Promise<QuickCaptureResult> {
    const text = request.text.trim();

    // Blank input never reaches the parser: no OpenAI call, no write.
    if (!text) {
      return buildResult('', request.source, [], []);
    }

    // A repeat from the offline queue answers with what the first request wrote (FT-106)
    const earlier = await this.earlierRecords(request.userId, request.clientId);
    if (earlier) return { ...buildResult(text, request.source, earlier.map(capturedFromRecord), []), repeated: true };

    // Checked after the repeat: a capture written once is answered, whatever time its retry carries (FT-175)
    const today = request.capturedAt ? this.inputDay(request.capturedAt) : undefined;

    // The source is now stored on every record (FT-103); a client that does not say is the Mini App
    const processed = await this.processTextInputUseCase.execute(text, request.userId, request.userName, {
      source: request.source ?? 'miniapp',
      ...(request.clientId ? { clientId: request.clientId } : {}),
      ...(today ? { today } : {}),
    });
    const result = buildResult(
      text,
      request.source,
      processed.transactions.map(toCapturedTransaction),
      processed.debts
    );
    // Named without an amount (FT-123): nothing written, the bot asks how much
    if (processed.withoutAmount?.length) result.withoutAmount = processed.withoutAmount;

    // Captured text is user content, so only counts and routing metadata are logged.
    logger.info('Quick capture processed', {
      source: request.source ?? 'unspecified',
      status: result.status,
      transactions: result.transactions.length,
      debts: processed.debts.length,
      withoutAmount: processed.withoutAmount?.length ?? 0,
    });

    return result;
  }

  /**
   * The day the phrase was typed (FT-175). Up to a day ahead of the server it is still the phone's time — the PC's clock
   * in WSL lags after a sleep; further ahead the phone's clock is wrong and the server's dates it. A time too old is not
   * the time of input, so the capture is refused.
   */
  private inputDay(capturedAt: Date): string {
    const now = this.now();
    const problem = capturedAtProblem(capturedAt, now);
    if (problem === 'too_old') throw ErrorFactory.validation(CAPTURED_AT_TOO_OLD, 'capturedAt');
    if (problem === 'ahead' || problem === 'far_ahead') {
      logger.warn('capturedAt is ahead of the server clock', {
        aheadMinutes: Math.round((capturedAt.getTime() - now.getTime()) / 60_000),
        datedBy: problem === 'ahead' ? 'capturedAt' : 'server',
      });
    }
    return inputDayOf(problem === 'far_ahead' ? now : capturedAt);
  }

  /**
   * Writes an item a phrase named without an amount, with the amount of the answer to «Сколько?» (FT-123),
   * through the same pipeline as the phrase itself.
   */
  async captureWithAmount(request: AmountAnswerRequest): Promise<QuickCaptureResult> {
    const written = await this.processTextInputUseCase.executeWithAmount(
      request.item,
      request.answer,
      request.userId,
      request.userName,
      { source: request.source ?? 'miniapp', ...(request.clientId ? { clientId: request.clientId } : {}) }
    );
    const text = `${request.item.description} ${request.answer.text}`.trim();
    return buildResult(text, request.source, written ? [toCapturedTransaction(written)] : [], []);
  }
}

function buildResult(
  text: string,
  source: RecordSource | undefined,
  transactions: CapturedTransaction[],
  debts: CapturedDebt[]
): QuickCaptureResult {
  const reasons: CaptureReviewReason[] = [];
  if (transactions.some(transaction => transaction.needsReview)) {
    reasons.push('transaction_needs_review');
  }
  if (debts.length > 0) {
    reasons.push('debt_detected');
  }

  return {
    status: resolveStatus(transactions, debts.length),
    text,
    source,
    transactions,
    debts,
    ack: buildCaptureAck(transactions, { debtsDetected: debts.length }),
    review: { reasons },
  };
}

function resolveStatus(transactions: CapturedTransaction[], debtsDetected: number): QuickCaptureStatus {
  if (transactions.length === 0) {
    // A debt-only capture did write something, so it is not "no transaction" —
    // it is an outcome the client has to surface for review.
    return debtsDetected > 0 ? 'needs_review' : 'no_transaction';
  }

  return transactions.some(transaction => transaction.needsReview) ? 'needs_review' : 'saved';
}
