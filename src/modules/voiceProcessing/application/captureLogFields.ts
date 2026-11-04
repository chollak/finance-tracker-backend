import { ParsedDebt, ParsedTransaction } from '../domain/transcriptionService';

/**
 * What a log line says about a parsed record (#269): its shape, never the amount, the note or the merchant. Those are
 * what the user wrote or said, and the journal on the PC is read by sub-chats and pasted into chats and issues — as
 * quick capture already does, «only counts and routing metadata are logged».
 */
export function transactionLogFields(parsed: ParsedTransaction): Record<string, unknown> {
  return {
    type: parsed.type,
    semanticType: parsed.semanticType,
    currency: parsed.currency,
    hasAmount: Number.isFinite(parsed.amount) && parsed.amount !== 0,
    hasMerchant: Boolean(parsed.merchant),
    hasNote: Boolean(parsed.description),
    confidence: parsed.confidence,
  };
}

/** The same for a debt: no name, amount or note. */
export function debtLogFields(parsed: ParsedDebt): Record<string, unknown> {
  return {
    debtType: parsed.debtType,
    hasAmount: Number.isFinite(parsed.amount) && parsed.amount !== 0,
    hasPerson: Boolean(parsed.personName),
    hasNote: Boolean(parsed.description),
    hasDueDate: Boolean(parsed.dueDate),
  };
}
