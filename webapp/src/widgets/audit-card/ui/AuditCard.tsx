import { Link } from 'react-router-dom';
import { useCurrentAudit, useGoals } from '@/entities/audit';
import { useSettings, useUpdateSettings } from '@/entities/settings';
import { ROUTES } from '@/shared/lib/constants/routes';
import type { OpenedFromState } from '@/shared/lib/navigation';
import { showUndoToast } from '@/shared/lib/undo';
import { cn } from '@/shared/lib/utils';
import { auditHomeCard, snoozedUntilTomorrow, type HomeAuditCard } from '../lib/auditHomeCard';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink';
/** The audit tells «На главную» it was opened from Home, so it returns there instead of stacking Home again. */
const FROM_HOME: OpenedFromState = { from: ROUTES.HOME };

function Icon({ kind }: { kind: HomeAuditCard['kind'] }) {
  return (
    <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-track text-ink">
      <svg width="20" height="20" viewBox="0 0 20 20">
        {kind === 'invite' ? (
          <>
            <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="m13.2 13.2 3.6 3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="10" cy="10" r="2.5" fill="currentColor" />
          </>
        )}
      </svg>
    </span>
  );
}

function Text({ card }: { card: HomeAuditCard }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-px">
      <span className="text-[15px] font-extrabold leading-snug">{card.title}</span>
      <span className="text-[13px] font-semibold leading-[1.3] text-ink-muted">{card.subtitle}</span>
    </span>
  );
}

/**
 * Home's audit card under the month tiles (FT-132, InviteCard.md; boards «Главная», «Главная после ревизии · цели»):
 * the invitation to the audit of the month before with «Позже» — it hides the card until tomorrow (the setting
 * `auditInviteSnoozedUntil`), and the toast «Ревизия отложена» can undo it — and after «Готово» «Цели после ревизии» in
 * its place. Both open the audit. Nothing when there is nothing to show.
 */
export function AuditCard({ className }: { className?: string }) {
  const audit = useCurrentAudit();
  const goals = useGoals();
  const settings = useSettings();
  const { mutate, mutateAsync } = useUpdateSettings();

  const card = auditHomeCard({ audit: audit.data, goals: goals.data, snoozedUntil: settings.data?.auditInviteSnoozedUntil ?? null });
  if (!card) return null;

  const later = () => {
    if (!audit.data) return;
    const before = settings.data?.auditInviteSnoozedUntil ?? null;
    mutate(
      { auditInviteSnoozedUntil: snoozedUntilTomorrow(audit.data) },
      { onError: () => showUndoToast({ kind: 'info', title: 'Не получилось отложить ревизию', detail: 'Проверьте связь и попробуйте ещё раз' }) }
    );
    showUndoToast({
      kind: 'info',
      title: 'Ревизия отложена',
      detail: 'Вернём карточку завтра',
      undo: async () => {
        await mutateAsync({ auditInviteSnoozedUntil: before });
      },
    });
  };

  if (card.kind === 'goals') {
    return (
      <Link
        to={ROUTES.AUDIT}
        state={FROM_HOME}
        aria-label={card.aria}
        className={cn('flex min-h-16 items-center gap-3 rounded-card bg-card py-3 pl-3 pr-3.5 text-ink', FOCUS, className)}
      >
        <Icon kind="goals" />
        <Text card={card} />
        <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
          <path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    );
  }

  return (
    <div className={cn('flex items-center rounded-card bg-card text-ink', className)}>
      <Link to={ROUTES.AUDIT} state={FROM_HOME} aria-label={card.aria} className={cn('flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-card py-3 pl-3 pr-1', FOCUS)}>
        <Icon kind="invite" />
        <Text card={card} />
      </Link>
      <button
        type="button"
        onClick={later}
        aria-label="Позже — отложить ревизию до завтра"
        className={cn('mr-2 h-12 min-w-16 shrink-0 rounded-pill px-3 text-[14px] font-bold text-ink-muted', FOCUS)}
      >
        Позже
      </button>
    </div>
  );
}
