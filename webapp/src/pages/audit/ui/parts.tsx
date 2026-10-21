import type { ReactNode } from 'react';
import type { AuditCandidate, CandidateChange, GoalChoice } from '@/entities/audit';
import { cn } from '@/shared/lib/utils';
import type { PastelColor } from '@/shared/lib/pastel/categoryColors';
import { CategoryDot, Segmented, SkeletonBlock } from '@/shared/ui/pastel';
import type { AuditResultView, CandidateCardView, GoalRowView } from '../model/auditScreen';

export const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink';

// Text the boards leave at `line-height: normal` keeps `leading-[normal]` (the page's 1.5 would push the cards down)

/** The magnifier of the audit: the invitation, «Ещё» and the empty state draw the same one. */
export const SEARCH_ICON = (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="m13.2 13.2 3.6 3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true" className={cn('transition-transform duration-150', open && 'rotate-180')}>
      <path d="M5 7.5 10 12.5l5-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A text button of the card: «Показать 13 операций», «Показать все 13». */
function TextButton({ children, ...props }: { children: ReactNode; onClick: () => void; 'aria-expanded'?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cn('-my-1.5 -ml-2.5 flex h-touch items-center gap-1 self-start rounded-pill px-2.5 text-[14px] font-extrabold text-ink', FOCUS)}
    >
      {children}
    </button>
  );
}

const DECISIONS = [
  { value: 'need', label: 'Нужно' },
  { value: 'extra', label: 'Лишнее' },
] as const;

const GOALS = [
  { value: 'half', label: 'Вдвое меньше' },
  { value: 'drop', label: 'Отказаться' },
] as const;

/**
 * AuditCandidate.md: the kind and category, the title and the sum, the reason with its operations, and «Нужно /
 * Лишнее»; a second press takes the mark back. Marked, the card folds to the choice: a repeating extra asks «Что делаем
 * дальше», a needed one says when it comes back.
 */
export function CandidateCard({
  candidate,
  card,
  color,
  onToggleOps,
  onAllOps,
  onChange,
}: {
  candidate: AuditCandidate;
  card: CandidateCardView;
  color: PastelColor;
  onToggleOps: () => void;
  onAllOps: () => void;
  onChange: (change: CandidateChange) => void;
}) {
  const open = card.ops.length > 0;
  return (
    <article aria-label={card.aria} className="flex flex-col gap-2.5 rounded-card bg-card p-4">
      <div className="flex items-center gap-2">
        <CategoryDot name={candidate.categoryName} color={color} size="sm" />
        <span className="min-w-0 flex-1 text-[13px] font-bold leading-[normal] text-ink-muted">{card.kindLine}</span>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-extrabold leading-[1.3] tracking-[-0.2px]">{card.title}</h2>
        <span className="ml-auto whitespace-nowrap text-[15px] font-extrabold leading-[normal] tabular-nums">{card.amount}</span>
      </div>

      {card.reason && (
        <>
          <p className="text-[13px] font-semibold leading-[1.45] text-ink-muted">{card.reason}</p>
          <TextButton onClick={onToggleOps} aria-expanded={open}>
            {card.opsLabel}
            <Chevron open={open} />
          </TextButton>
          {open && (
            <ul className="-mt-1 rounded-[16px] bg-bg px-3 py-1">
              {card.ops.map((operation, index) => (
                <li key={index} className="flex min-h-8 items-center justify-between gap-2 text-[13px] font-semibold">
                  <span className="text-ink-muted">{operation.date}</span>
                  <span className="font-extrabold tabular-nums">{operation.amount}</span>
                </li>
              ))}
            </ul>
          )}
          {card.moreOps && <TextButton onClick={onAllOps}>{card.moreOps}</TextButton>}
        </>
      )}

      <Segmented
        options={DECISIONS}
        value={candidate.decision}
        onChange={(decision) => onChange({ decision })}
        allowDeselect
        onClear={() => onChange({ decision: null })}
        ariaLabel={card.groupAria}
        strong
      />

      {card.goal && (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-bold leading-[normal] text-ink-muted">Что делаем дальше</span>
          {card.goal.choices && (
            <Segmented<GoalChoice> options={GOALS} value={card.goal.choice} onChange={(goal) => onChange({ goal })} ariaLabel="Цель" />
          )}
          <span className="text-[13px] font-bold leading-[1.45]">{card.goal.text}</span>
        </div>
      )}
      {card.note && <span className="text-[13px] font-semibold leading-[1.45] text-ink-muted">{card.note}</span>}
    </article>
  );
}

/** PlanHero.md: the saving a month, or why there is none, and how the month goes since the audit. */
export function PlanHero({ result, headingRef }: { result: AuditResultView; headingRef: React.Ref<HTMLHeadingElement> }) {
  return (
    <section aria-label="Итог ревизии" className="flex flex-col gap-1 rounded-hero bg-primary px-5 pb-5 pt-4 text-on-primary">
      <h2 ref={headingRef} tabIndex={-1} className="scroll-mt-24 text-[14px] font-semibold leading-snug text-on-primary-muted outline-none">
        {result.heroLabel}
      </h2>
      {result.plan && (
        <>
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="type-balance whitespace-nowrap">{result.plan.amount}</span>{' '}
            <span className="text-[18px] font-semibold leading-[normal] text-on-primary-muted">сум в месяц</span>
          </p>
          <span className="text-[13px] font-semibold leading-[1.45] text-on-primary-muted">{result.plan.text}</span>
        </>
      )}
      {result.noPlan && (
        <>
          <p className="mt-1 text-[24px] font-extrabold leading-[1.25] tracking-[-0.4px]">{result.noPlan.title}</p>
          <p className="mt-1.5 text-[14px] font-semibold leading-[1.45] text-on-primary-muted">{result.noPlan.text}</p>
        </>
      )}
      {result.trend && <p className="mt-2.5 border-t border-hero-track pt-3 text-[15px] font-bold leading-[1.4]">{result.trend}</p>}
    </section>
  );
}

/** GoalList.md: one card, a row per goal; a subscription offers «Уже отменено» and «Напомнить». */
export function GoalList({
  sub,
  rows,
  onAnswer,
}: {
  sub: string | null;
  rows: Array<{ id: string; row: GoalRowView }>;
  onAnswer: (goalId: string, answer: 'cancelled' | 'remind') => void;
}) {
  return (
    <section aria-labelledby="audit-goals-title" className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5 px-1 pt-1">
        <h2 id="audit-goals-title" className="type-section">
          Цели
        </h2>
        {sub && <span className="text-[13px] font-semibold leading-[normal] text-ink-muted">{sub}</span>}
      </div>
      <ul className="rounded-card bg-card px-4 py-1">
        {rows.map(({ id, row }) => (
          <li key={id} className="flex flex-col gap-1.5 border-t border-line py-3 first:border-t-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
              <span className="text-[15px] font-bold leading-[normal]">{row.name}</span>
              <span className="ml-auto text-right text-[13px] font-bold leading-[normal] text-ink-muted">{row.goal}</span>
            </div>
            {row.bar !== null && (
              <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-[3px] bg-bar-track">
                <span className="block h-1.5 rounded-[3px] bg-ink" style={{ width: `${(row.bar * 100).toFixed(1)}%` }} />
              </span>
            )}
            <span className="text-[13px] font-bold leading-[1.45]">{row.status}</span>
            {row.trend && <span className="text-[13px] font-semibold leading-[1.45] text-ink-muted">{row.trend}</span>}
            {row.actions && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-label={row.actions.done.aria}
                  onClick={() => onAnswer(id, 'cancelled')}
                  className={cn('h-touch rounded-pill bg-track px-4 text-[14px] font-extrabold text-ink', FOCUS)}
                >
                  {row.actions.done.label}
                </button>
                {row.actions.remind && (
                  <button
                    type="button"
                    aria-label={row.actions.remind.aria}
                    onClick={() => onAnswer(id, 'remind')}
                    className={cn('h-touch rounded-pill bg-track px-4 text-[14px] font-extrabold text-ink', FOCUS)}
                  >
                    {row.actions.remind.label}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** «Разовое лишнее», «Нужное»: a card with a heading, the list and one line under it. */
export function ResultList({ id, title, list, note }: { id: string; title: string; list: string; note: string }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1.5 rounded-card bg-card px-4 py-3.5">
      <h2 id={id} className="text-[13px] font-bold leading-[normal] text-ink-muted">
        {title}
      </h2>
      <span className="text-[15px] font-bold leading-[1.45]">{list}</span>
      <span className="text-[13px] font-semibold leading-[1.45] text-ink-muted">{note}</span>
    </section>
  );
}

/** The list while the audit is read: its shapes, no spinner (Skeleton.md). */
export function LoadingAudit() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className="flex flex-col gap-3 rounded-card bg-card px-5 pb-[18px] pt-4" aria-hidden="true">
        <SkeletonBlock className="h-3.5 w-full" />
        <SkeletonBlock className="h-3.5 w-3/4" />
        <SkeletonBlock className="mt-1 h-1.5 w-full" />
      </div>
      {[0, 1].map((card) => (
        <div key={card} className="flex flex-col gap-3 rounded-card bg-card p-4" aria-hidden="true">
          <SkeletonBlock className="h-3 w-40" />
          <SkeletonBlock className="h-4 w-56" />
          <SkeletonBlock className="h-3 w-full" />
          <SkeletonBlock radius="pill" className="mt-1 h-12 w-full" />
        </div>
      ))}
      <span className="sr-only" role="status">
        Загружаю ревизию…
      </span>
    </div>
  );
}

/** A read that failed says so and reads again. */
export function ReadFailed({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div className="flex flex-col items-start gap-1 rounded-card bg-card px-5 pb-2 pt-5">
      <p className="text-[14px] font-medium leading-[1.45] text-ink-muted">Не удалось загрузить ревизию.</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        aria-busy={retrying}
        className={cn('-ml-3 h-touch rounded-pill px-3 text-[14px] font-extrabold text-ink disabled:text-ink-muted', FOCUS)}
      >
        Попробовать снова
      </button>
    </div>
  );
}
