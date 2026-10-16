import { ProcessTextInputUseCase } from '../../voiceProcessing/application/processTextInput';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { buildCaptureAck } from './buildCaptureAck';
import { capturedFromRecord, toCapturedTransaction } from './toCapturedTransaction';
import {
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

/**
 * The shared quick-capture boundary. It owns the client-facing contract (status + ack)
 * and nothing else: parsing, the conservative transfer/savings/withdrawal safeguards and
 * persistence all stay inside ProcessTextInputUseCase, which this service only wraps.
 */
export class QuickCaptureService {
  /** Captures with a clientId still being parsed, so a retry waits for them instead of parsing again. */
  private inFlight = new Map<string, Promise<QuickCaptureResult>>();

  constructor(private processTextInputUseCase: ProcessTextInputUseCase, private replay?: CaptureReplay) {}

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

    // The source is now stored on every record (FT-103); a client that does not say is the Mini App
    const processed = await this.processTextInputUseCase.execute(text, request.userId, request.userName, {
      source: request.source ?? 'miniapp',
      ...(request.clientId ? { clientId: request.clientId } : {}),
    });
    const result = buildResult(
      text,
      request.source,
      processed.transactions.map(toCapturedTransaction),
      processed.debts
    );

    // Captured text is user content, so only counts and routing metadata are logged.
    logger.info('Quick capture processed', {
      source: request.source ?? 'unspecified',
      status: result.status,
      transactions: result.transactions.length,
      debts: processed.debts.length,
    });

    return result;
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
