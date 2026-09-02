import { ProcessTextInputUseCase } from '../../voiceProcessing/application/processTextInput';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { buildCaptureAck } from './buildCaptureAck';
import { toCapturedTransaction } from './toCapturedTransaction';
import {
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
  constructor(private processTextInputUseCase: ProcessTextInputUseCase) {}

  async capture(request: QuickCaptureRequest): Promise<QuickCaptureResult> {
    const text = request.text.trim();

    // Blank input never reaches the parser: no OpenAI call, no write.
    if (!text) {
      return buildResult('', request.source, [], []);
    }

    const processed = await this.processTextInputUseCase.execute(text, request.userId, request.userName);
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
