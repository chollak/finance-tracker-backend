import { DetectedTransaction } from '../../voiceProcessing/domain/processedTransaction';
import { countsAsRealExpense, normalizeSemanticType } from '../../transaction/domain/transactionSemanticType';
import { CapturedTransaction } from '../domain/quickCaptureTypes';
import { Transaction } from '../../transaction/domain/transactionEntity';

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
    currency: detected.currency,
    accountId: detected.accountId,
    accountName: detected.accountName,
    assumptions: detected.assumptions,
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

/**
 * A stored record in the capture contract, for a repeated capture (FT-106). What only the parse knew —
 * the account name, the assumptions — is not stored, so it is left out.
 */
export function capturedFromRecord(record: Transaction): CapturedTransaction {
  const semanticType = normalizeSemanticType(record.semanticType, record.type);

  return {
    id: record.id!,
    amount: record.amount,
    currency: record.currency,
    accountId: record.accountId,
    type: record.type,
    semanticType,
    category: record.category,
    description: record.description,
    merchant: record.merchant,
    date: record.date,
    confidence: record.confidence,
    needsReview: record.needsReview === true,
    countsAsRealExpense: countsAsRealExpense(semanticType),
    ...(record.deletedAt ? { deletedAt: record.deletedAt } : {}),
  };
}
