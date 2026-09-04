import { format, isSameDay, isSameYear, parseISO, subDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { TransactionSemanticType } from '@/shared/types';
import { getCategoryName } from '@/entities/category/model/categories';
import type { TransactionViewModel } from '../model/types';
import { NEEDS_REVIEW_LABEL } from './semanticType';

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

export function getCorrectionToggleLabel(isExpanded: boolean): string {
  return isExpanded ? 'Скрыть варианты' : 'Исправить тип';
}

/**
 * Compact-row display rules (FT-080).
 *
 * The recent list on Home is a correction log: one line per capture, scanned top to
 * bottom right after saving. Everything the old management row spent vertical space
 * on — badges, hints, a second amount column — collapses into one meta line, so the
 * decisions about what earns a place on it live here and stay testable.
 */

/** Separator between meta segments — a dot reads as "and also", not as a hierarchy. */
const COMPACT_META_SEPARATOR = ' · ';
const BUSINESS_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

function parseBusinessDate(value: string): Date {
  const match = BUSINESS_DATE_PATTERN.exec(value);
  if (!match) return parseISO(value);

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

/**
 * Day marker for a compact row.
 *
 * `null` for today, which is the common case right after a capture: repeating
 * «Сегодня» on every row would only add noise. Older rows need the marker because
 * the recent list has no date headers to group them (unlike the History page).
 * Reads `transaction.date` — the day of the operation, not `createdAt`, which is
 * the moment the row was inserted (FT-056).
 */
export function formatCompactRowDayLabel(date: string | Date, now: Date): string | null {
  const parsed = typeof date === 'string' ? parseBusinessDate(date) : date;
  if (Number.isNaN(parsed.getTime())) return null;

  if (isSameDay(parsed, now)) return null;
  if (isSameDay(parsed, subDays(now, 1))) return 'Вчера';
  if (isSameYear(parsed, now)) return format(parsed, 'd MMM', { locale: ru });

  return format(parsed, 'd MMM yyyy', { locale: ru });
}

/**
 * The one secondary line of a compact row: category, what kind of movement it was,
 * and when — in that order, because the category identifies the row and the day only
 * disambiguates it.
 *
 * The semantic label appears only for movements that are neither spending nor income
 * (transfers, savings, cash, debt, refunds, group payments). Those carry a neutral
 * grey amount, so the line has to say why it is not counted as a расход. An ordinary
 * expense or income says it already through the amount's sign and colour, so
 * repeating «Расход»/«Доход» would cost the width the description needs.
 */
export function formatCompactRowMeta(transaction: TransactionViewModel, now: Date): string {
  const dayLabel = formatCompactRowDayLabel(transaction.date, now);

  return [
    getCategoryName(transaction.category),
    transaction._isNonExpenseMovement ? transaction._semanticTypeLabel : null,
    dayLabel,
  ]
    .filter((segment): segment is string => !!segment)
    .join(COMPACT_META_SEPARATOR);
}

/**
 * Accessible name for a compact row.
 *
 * The row is a single control that opens the edit screen, so its name has to carry
 * what the two visual lines carry: what was bought, for how much, and whether the
 * parse still needs a correction. The category/day meta is left out — it is context
 * for scanning, not for deciding whether to open this row.
 */
export function formatCompactRowAriaLabel(transaction: TransactionViewModel): string {
  const description = transaction.description?.trim() || getCategoryName(transaction.category);
  const parts = [`Изменить: ${description}`, transaction._formattedAmount];

  if (transaction._needsReview) {
    parts.push(NEEDS_REVIEW_LABEL.toLowerCase());
  }

  return parts.join(', ');
}
