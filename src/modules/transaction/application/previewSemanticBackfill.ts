/**
 * Turns stored rows into the FT-045 backfill report: counters, per-rule groups and the list of
 * cases a human has to decide. Pure — it neither reads nor writes storage, so the same function
 * serves the CLI preview and its tests.
 */

import {
  BackfillRule,
  BackfillSuggestion,
  StoredTransactionRow,
  backfillSearchText,
  isBackfillCandidate,
  isTruthyFlag,
  suggestSemanticType,
} from '../domain/semanticBackfillSuggestion';
import { TransactionSemanticType } from '../domain/transactionSemanticType';

export interface PreviewedRow {
  id: string;
  date: string | null;
  amount: number | null;
  type: string | null;
  category: string | null;
  storedSemanticType: string | null;
  storedNeedsReview: boolean;
  isArchived: boolean;
  /** Wording the rules actually looked at, so a verdict can be checked against its input. */
  text: string;
  suggestion: BackfillSuggestion;
}

export interface RuleGroup {
  rule: BackfillRule;
  suggestedType: TransactionSemanticType | null;
  needsReview: boolean;
  count: number;
  examples: PreviewedRow[];
}

export interface SemanticBackfillPreview {
  totals: {
    scanned: number;
    /** Rows already carrying a non-legacy semantic type — left untouched by the preview. */
    alreadyTyped: number;
    candidates: number;
    archivedCandidates: number;
    /** Candidates a rule answered outright. */
    confident: number;
    /** Candidates a rule flagged as a question rather than an answer. */
    needsReview: number;
    /** Candidates no rule matched. */
    unmatched: number;
  };
  /** How many candidates each proposed semantic type would claim. */
  bySuggestedType: Record<string, number>;
  byRule: RuleGroup[];
  /** The uncertain cases, the ones Shukur has to rule on before any backfill is applied. */
  disputed: PreviewedRow[];
  /** Every candidate with its verdict; the caller decides how much of it to print. */
  rows: PreviewedRow[];
}

export interface PreviewSemanticBackfillOptions {
  /** Rows shown per rule group in the report. */
  examplesPerRule?: number;
  /** How many uncertain rows to list in full. */
  disputedLimit?: number;
}

function toPreviewedRow(row: StoredTransactionRow, suggestion: BackfillSuggestion): PreviewedRow {
  return {
    id: row.id,
    date: row.date ?? row.createdAt ?? null,
    amount: row.amount ?? null,
    type: row.type ?? null,
    category: row.category ?? null,
    storedSemanticType: row.semanticType ?? null,
    storedNeedsReview: isTruthyFlag(row.needsReview),
    isArchived: isTruthyFlag(row.isArchived),
    text: backfillSearchText(row),
    suggestion,
  };
}

export function previewSemanticBackfill(
  rows: StoredTransactionRow[],
  options: PreviewSemanticBackfillOptions = {}
): SemanticBackfillPreview {
  const examplesPerRule = options.examplesPerRule ?? 5;
  const disputedLimit = options.disputedLimit ?? 20;

  const previewed: PreviewedRow[] = [];
  const bySuggestedType: Record<string, number> = {};
  const groups = new Map<BackfillRule, RuleGroup>();

  let alreadyTyped = 0;
  let archivedCandidates = 0;
  let confident = 0;
  let needsReview = 0;
  let unmatched = 0;

  for (const row of rows) {
    if (!isBackfillCandidate(row)) {
      alreadyTyped++;
      continue;
    }

    const suggestion = suggestSemanticType(row);
    const previewedRow = toPreviewedRow(row, suggestion);
    previewed.push(previewedRow);

    if (previewedRow.isArchived) archivedCandidates++;

    if (suggestion.suggestedType === null) {
      unmatched++;
    } else {
      bySuggestedType[suggestion.suggestedType] = (bySuggestedType[suggestion.suggestedType] ?? 0) + 1;
      if (suggestion.needsReview) needsReview++;
      else confident++;
    }

    const group = groups.get(suggestion.rule);
    if (group) {
      group.count++;
      if (group.examples.length < examplesPerRule) group.examples.push(previewedRow);
    } else {
      groups.set(suggestion.rule, {
        rule: suggestion.rule,
        suggestedType: suggestion.suggestedType,
        needsReview: suggestion.needsReview,
        count: 1,
        examples: examplesPerRule > 0 ? [previewedRow] : [],
      });
    }
  }

  const byRule = [...groups.values()].sort((a, b) => b.count - a.count || a.rule.localeCompare(b.rule));
  const disputed = previewed
    .filter(row => row.suggestion.needsReview)
    .slice(0, disputedLimit);

  return {
    totals: {
      scanned: rows.length,
      alreadyTyped,
      candidates: previewed.length,
      archivedCandidates,
      confident,
      needsReview,
      unmatched,
    },
    bySuggestedType,
    byRule,
    disputed,
    rows: previewed,
  };
}
