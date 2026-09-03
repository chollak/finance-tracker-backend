import type { TransactionSemanticType } from '@/shared/types';

/**
 * Display rules for a transaction row in the list (FT-056).
 * Pure functions so the row's readability decisions are testable without a DOM.
 */

/**
 * An ordinary expense already says «расход» through the red amount and the minus
 * sign, so the badge only repeats it while taking width from the description.
 * Every other semantic type carries information the row cannot show otherwise.
 */
export function shouldShowSemanticTypeBadge(semanticType: TransactionSemanticType): boolean {
  return semanticType !== 'expense';
}

/**
 * The description column is roughly 150px wide at a 390px viewport and clamps to
 * two lines, which holds about this many Cyrillic characters. Typical descriptions
 * (10–40 chars) fit; only longer ones still need the full text in a tooltip.
 */
export const DESCRIPTION_VISIBLE_CHARS = 44;

export function shouldShowDescriptionTooltip(description?: string | null): boolean {
  return (description?.length ?? 0) > DESCRIPTION_VISIBLE_CHARS;
}
