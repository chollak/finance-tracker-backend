import type { Audit, Goals } from '@/entities/audit';
import { addDays, monthNameOf } from '@/shared/lib/dates';
import { formatMinor } from '@/shared/lib/money';
import { pluralWithCount } from '@/shared/lib/plural';

/**
 * The one card of Home under the month tiles (FT-132, InviteCard.md; boards «Главная», «Главная после ревизии · цели»):
 * the invitation to the audit while it waits, «Цели после ревизии» once it is done, nothing when there is nothing.
 */
export type HomeAuditCard =
  | { kind: 'invite'; title: string; subtitle: string; aria: string }
  | { kind: 'goals'; title: string; subtitle: string; aria: string };

/**
 * `snoozedUntil` — the day «Позже» put the invitation off to (settings `auditInviteSnoozedUntil`): hidden until that
 * day comes, by the server's day in Tashkent.
 */
export function auditHomeCard({
  audit,
  goals,
  snoozedUntil,
}: {
  audit: Audit | undefined;
  goals: Goals | undefined;
  snoozedUntil: string | null;
}): HomeAuditCard | null {
  if (audit && audit.state === 'open' && audit.summary.count > 0 && !(snoozedUntil && snoozedUntil > audit.today)) {
    const title = `Ревизия ${monthNameOf(Number(audit.month.slice(5, 7)))}`;
    const left = audit.summary.left;
    const waiting = `${pluralWithCount(left, 'трата', 'траты', 'трат')} на проверку`;
    return {
      kind: 'invite',
      title,
      subtitle: left > 0 ? `${waiting} · пара минут` : 'Всё отмечено — осталось нажать «Готово»',
      aria: `${title}: ${left > 0 ? waiting : 'всё отмечено'}. Открыть`,
    };
  }
  if (goals && goals.goals.length > 0) {
    const count = pluralWithCount(goals.goals.length, 'цель', 'цели', 'целей');
    const saving = formatMinor(goals.planMinor, 'UZS');
    return {
      kind: 'goals',
      title: 'Цели после ревизии',
      subtitle: `${count} · экономия до ${saving}`,
      aria: `Цели после ревизии: ${count}, экономия до ${saving} в месяц. Открыть`,
    };
  }
  return null;
}

/** «Позже» hides the invitation until tomorrow. */
export function snoozedUntilTomorrow(audit: Pick<Audit, 'today'>): string {
  return addDays(audit.today, 1);
}
