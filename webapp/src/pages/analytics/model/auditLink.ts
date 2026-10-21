import type { Audit } from '@/entities/audit';
import { monthNameOf } from '@/shared/lib/dates';

/**
 * The audit card under the expenses of the month it audits (FT-132, board «Аналитика · прошлый месяц»,
 * Pastel_Analytics.dc.html `hasAudit`): «Ревизия сентября · Найти траты, без которых можно обойтись»; after «Готово» it
 * leads to the result. Not for another month, the income, an empty month, nor before the first audit.
 */
export function auditLink(
  audit: Audit | undefined,
  shown: { month: string; type: 'expense' | 'income'; hasData: boolean }
): { title: string; subtitle: string } | null {
  if (!audit || audit.state === 'too_early' || audit.month !== shown.month || shown.type !== 'expense' || !shown.hasData) return null;
  const title = `Ревизия ${monthNameOf(Number(audit.month.slice(5, 7)))}`;
  if (audit.state === 'done') return { title, subtitle: audit.goals.length > 0 ? 'Итог и цели' : 'Итог ревизии' };
  return { title, subtitle: 'Найти траты, без которых можно обойтись' };
}
