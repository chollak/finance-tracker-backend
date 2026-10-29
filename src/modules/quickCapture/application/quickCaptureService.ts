import { ProcessTextInputUseCase } from '../../voiceProcessing/application/processTextInput';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { ErrorFactory } from '../../../shared/domain/errors/AppError';
import { buildCaptureAck } from './buildCaptureAck';
import { capturedFromRecord, toCapturedTransaction } from './toCapturedTransaction';
import { CAPTURED_AT_LIMITS, capturedAtProblem, inputDayOf } from '../domain/capturedAt';
import {
  AmountAnswerRequest,
  CaptureReplay,
  CaptureReviewReason,
  CaptureSource,
  CapturedDebt,
  CapturedTransaction,
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
    private now: () => Date = () => new Date()
  ) {}

  async capture(request: QuickCaptureRequest): Promise<QuickCaptureResult> {
    if (!request.clientId) return this.captureOnce(request);

    // A retry that arrives while the first request is still with the parser (a client timeout) waits
    // for it: two parses of one text may differ, and their records must not mix (FT-106)
    const key = `${request.userId}\u0000${request.clientId}`;
    const running = this.inFlight.get(key);
    if (running) return { ...(await running), repeated: true };
    const capture = this.captureOnce(request).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, capture);
    return capture;
  }

  private async captureOnce(request: QuickCaptureRequest): Promise<QuickCaptureResult> {
    const text = request.text.trim();

    // Blank input never reaches the parser: no OpenAI call, no write.
    if (!text) {
      return buildResult('', request.source, [], []);
    }

    // A repeat from the offline queue answers with what the first request wrote (FT-106)
    if (request.clientId && this.replay) {
      const earlier = await this.replay.findByClientId(request.userId, request.clientId);
      if (earlier.length > 0) {
        logger.info('Quick capture repeated', { transactions: earlier.length });
        return { ...buildResult(text, request.source, earlier.map(capturedFromRecord), []), repeated: true };
      }
    }

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
   * The day the phrase was typed (FT-175). A time too far ahead is dated by the server's clock — the PC's in WSL lags
   * after a sleep — and a time too old is not the time of input, so the capture is refused.
   */
  private inputDay(capturedAt: Date): string {
    const now = this.now();
    const problem = capturedAtProblem(capturedAt, now);
    if (problem === 'too_old') throw ErrorFactory.validation(CAPTURED_AT_TOO_OLD, 'capturedAt');
    if (problem === 'ahead') {
      logger.warn('capturedAt is ahead of the server clock; dated by the server', {
        aheadMinutes: Math.round((capturedAt.getTime() - now.getTime()) / 60_000),
      });
      return inputDayOf(now);
    }
    return inputDayOf(capturedAt);
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
  source: CaptureSource | undefined,
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
