import { DetectedTransaction } from '../../voiceProcessing/domain/processedTransaction';
import { countsAsRealExpense, normalizeSemanticType } from '../../transaction/domain/transactionSemanticType';
import { CapturedTransaction } from '../domain/quickCaptureTypes';

/**
 * Lifts a transaction the parser already persisted into the shared capture contract.
 *
 * Lives outside QuickCaptureService because voice cannot go through `capture()` — it needs
 * download/transcription first — yet its result must be described with exactly the same
 * semantics, otherwise voice and text would drift apart in what "counts as an expense" means.
 */
export function toCapturedTransaction(detected: DetectedTransaction): CapturedTransaction {
  const semanticType = normalizeSemanticType(detected.semanticType, detected.type);

  return {
    id: detected.id,
    amount: detected.amount,
    type: detected.type,
    semanticType,
    category: detected.category,
    description: detected.description,
    merchant: detected.merchant,
    date: detected.date,
    confidence: detected.confidence,
    needsReview: detected.needsReview === true,
    countsAsRealExpense: countsAsRealExpense(semanticType),
  };
}
