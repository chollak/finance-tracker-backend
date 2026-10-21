import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuditWrites, useCurrentAudit, type Audit, type SubscriptionAnswer } from '@/entities/audit';
import { findCategory, useCategories } from '@/entities/category';
import { useSettings } from '@/entities/settings';
import { ROUTES } from '@/shared/lib/constants/routes';
import { useShowHomeAfterSave } from '@/shared/lib/navigation';
import { showUndoToast } from '@/shared/lib/undo';
import { cn } from '@/shared/lib/utils';
import { BackButton, Button, EmptyState, UndoToast } from '@/shared/ui/pastel';
import {
  auditFooter,
  auditIntro,
  auditResult,
  auditScreenTitle,
  candidateCard,
  goalLiveText,
  goalRow,
  initialAuditView,
  tooEarlyView,
} from '../model/auditScreen';
import { CandidateCard, FOCUS, GoalList, LoadingAudit, PlanHero, ReadFailed, ResultList, SEARCH_ICON } from './parts';

const FAILED = {
  mark: { title: 'Отметка не сохранилась', detail: 'Проверьте связь и нажмите ещё раз' },
  finish: { title: 'Ревизия не завершилась', detail: 'Проверьте связь и нажмите «Готово» ещё раз' },
  goal: { title: 'Ответ не сохранился', detail: 'Проверьте связь и нажмите ещё раз' },
} as const;

function TooEarly({ audit }: { audit: Audit }) {
  const view = tooEarlyView(audit);
  return (
    // The board's empty state sits 64px under the header (the icon's top at 128px), as analytics' empty month: the page's
    // 4px, this 12px and EmptyState's own 48px
    <div className="pt-3">
      <EmptyState
        icon={SEARCH_ICON}
        title={view.title}
        text={view.text}
        action={<span className="mt-1.5 text-[13px] font-bold leading-[normal] text-ink-muted">{view.progress}</span>}
      />
    </div>
  );
}

/**
 * The spending audit of the month before (FT-132, row «Ревизия трат — что было лишним»; design-system «Ревизия
 * трат»): the AI's candidates, each marked «Нужно» or «Лишнее» and saved by the press (a second press takes it back);
 * a repeating extra gets «Вдвое меньше / Отказаться», a subscription «Отменить». «Готово» after the first mark shows
 * the plan: the saving a month, the goals counted from the audit day with the same days of the month before, the one-off
 * extra and what was needed; «Изменить отметки» returns to the list. Before a whole month of records — when the first
 * audit comes. Opened from Home's invitation and «Цели после ревизии», from «Ещё» and from analytics; «Назад» returns
 * there, «На главную» opens Home.
 */
export function AuditPage() {
  const audit = useCurrentAudit();
  const categories = useCategories();
  // «а у лимита напишем в боте» only while the bot will (FT-133)
  const settings = useSettings();
  const { mark, finish, answerGoal } = useAuditWrites({ onFailed: (_error, what) => showUndoToast({ kind: 'info', ...FAILED[what] }) });
  const showHome = useShowHomeAfterSave();
  const [chosenView, setView] = useState<'list' | 'done' | null>(null);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [allOps, setAllOps] = useState<Record<string, boolean>>({});
  const [finishing, setFinishing] = useState(false);
  const [live, setLive] = useState('');
  const [focusResult, setFocusResult] = useState(false);
  const resultHeading = useRef<HTMLHeadingElement>(null);

  const data = audit.data;
  const view = chosenView ?? (data ? initialAuditView(data) : null);

  // After «Готово» the focus goes to the result, as the board does
  useEffect(() => {
    if (!focusResult || view !== 'done') return;
    resultHeading.current?.focus();
    setFocusResult(false);
  }, [focusResult, view]);

  const pressDone = async () => {
    if (!data?.id || finishing || data.summary.marked === 0) return;
    setFinishing(true);
    try {
      await finish(data.id);
      setLive('');
      setView('done');
      // Focusing the result's heading brings the top of the result into view
      setFocusResult(true);
    } catch {
      // The toast says so; the list stays for another try
    } finally {
      setFinishing(false);
    }
  };

  const answer = (goalId: string, subscription: SubscriptionAnswer) => {
    const goal = data?.goals.find((entry) => entry.id === goalId);
    if (!goal) return;
    setLive(goalLiveText(goal, subscription));
    answerGoal(goalId, subscription);
  };

  let content;
  let footer = null;
  if (!data) {
    content = audit.isError ? <ReadFailed onRetry={() => void audit.refetch()} retrying={audit.isFetching} /> : <LoadingAudit />;
  } else if (data.state === 'too_early') {
    content = <TooEarly audit={data} />;
  } else if (view === 'list') {
    const intro = auditIntro(data);
    const foot = auditFooter(data);
    content = (
      <div className="flex flex-col gap-3 pb-[calc(196px+env(safe-area-inset-bottom))]">
        <section aria-label="О ревизии" className="flex flex-col gap-2.5 rounded-card bg-card px-5 pb-[18px] pt-4">
          <p className="text-[15px] font-semibold leading-[1.45]">{intro.text}</p>
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-track">
              <span className="block h-1.5 rounded-[3px] bg-ink transition-[width] duration-200" style={{ width: `${(intro.share * 100).toFixed(1)}%` }} />
            </span>
            <span className="shrink-0 text-[13px] font-bold leading-[normal] text-ink-muted">{intro.progress}</span>
          </div>
        </section>
        {data.candidates.map((candidate) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
            card={candidateCard(candidate, { open: !!opened[candidate.id], allOps: !!allOps[candidate.id] })}
            color={findCategory(categories.data, candidate.categoryId)?.color ?? 'mist'}
            onToggleOps={() => setOpened((state) => ({ ...state, [candidate.id]: !state[candidate.id] }))}
            onAllOps={() => setAllOps((state) => ({ ...state, [candidate.id]: true }))}
            onChange={(change) => data.id && mark(data.id, candidate.id, change)}
          />
        ))}
      </div>
    );
    footer = (
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg">
        <div className="mx-auto flex max-w-3xl flex-col gap-2.5 px-4 pb-[calc(24px+env(safe-area-inset-bottom))] pt-3.5">
          <div aria-live="polite" className="flex flex-col gap-0.5 px-1">
            {foot.plan && <span className="text-[15px] font-extrabold leading-[1.35] tabular-nums">{foot.plan}</span>}
            {foot.left && <span className="text-[13px] font-semibold leading-[1.4] text-ink-muted">{foot.left}</span>}
          </div>
          <Button
            aria-disabled={!foot.ready || finishing}
            aria-busy={finishing || undefined}
            onClick={() => void pressDone()}
            className={cn(!foot.ready && 'bg-track text-seg-off active:scale-100')}
          >
            {foot.label}
          </Button>
        </div>
      </div>
    );
  } else {
    const result = auditResult(data, { goalAlertsEnabled: settings.data?.goalAlertsEnabled });
    content = (
      <div className="flex flex-col gap-3 pb-[calc(32px+env(safe-area-inset-bottom))]">
        <PlanHero result={result} headingRef={resultHeading} />
        {data.goals.length > 0 && (
          <GoalList sub={result.goalsSub} rows={data.goals.map((goal) => ({ id: goal.id, row: goalRow(goal) }))} onAnswer={answer} />
        )}
        {result.oneOff && <ResultList id="audit-oneoff-title" title="Разовое лишнее" list={result.oneOff} note="Цель не нужна: это разовые покупки." />}
        {result.need && (
          <ResultList id="audit-need-title" title="Нужное" list={result.need} note="Больше не будем их предлагать, пока они заметно не вырастут." />
        )}
        <span className="px-1 text-[13px] font-semibold leading-[1.45] text-ink-muted">{result.next}</span>
        <p role="status" className="sr-only">
          {live}
        </p>
        <Link
          to={ROUTES.HOME}
          onClick={(event) => {
            event.preventDefault();
            showHome();
          }}
          className={cn('flex h-button items-center justify-center rounded-pill bg-primary text-on-primary type-button', FOCUS, 'focus-visible:ring-offset-2 focus-visible:ring-offset-bg')}
        >
          На главную
        </Link>
        {result.canEdit && (
          <button
            type="button"
            onClick={() => {
              setLive('');
              setView('list');
            }}
            className={cn('h-touch rounded-pill text-[15px] font-extrabold text-ink', FOCUS)}
          >
            Изменить отметки
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl text-ink">
      {/* The header stays and the list scrolls under it, as on History and «Ещё» */}
      <div className="sticky top-0 z-10 bg-bg px-4 py-2">
        <header className="flex h-key items-center gap-3">
          <BackButton />
          <h1 className="type-section">{data ? auditScreenTitle(data) : 'Ревизия трат'}</h1>
        </header>
      </div>
      <div className="px-4 pt-1">{content}</div>
      {footer}
      {/* «Отметка не сохранилась» over the footer of the list */}
      <UndoToast bottom={view === 'list' ? 176 : 24} />
    </div>
  );
}
