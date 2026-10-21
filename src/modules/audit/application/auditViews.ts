import { isValidDateOnly, todayDateOnly } from '../../../shared/domain/dates/dateOnly';
import { shiftMonth } from '../../transaction/domain/monthAnalytics';
import {
  Audit,
  AuditItem,
  AuditSummary,
  GoalChoice,
  GoalKind,
  auditMonthOn,
  auditSummary,
  goalOf,
  isServiceCandidate,
  nextAuditOn,
  savingOf,
} from '../domain/audit';
import { AuditCandidate, AuditRecord, auditRecordsOf } from '../domain/auditRules';
import { GoalRepository } from '../domain/auditRepository';
import { AuditSources } from '../domain/auditSources';
import { Goal, GoalComparison, GoalSubscription, combinedComparison, goalProgress, goalSavingMinor, goalServiceKind, halfLimitMinor } from '../domain/goal';

/** A candidate as the audit screen gets it (FT-131): what the rules found and what was decided. */
export interface AuditCandidateView
  extends Pick<
    AuditCandidate,
    'kind' | 'kindLabel' | 'categoryId' | 'categoryName' | 'name' | 'title' | 'amountMinor' | 'count' | 'recurring' | 'monthlyMinor' | 'operations' | 'previous' | 'reason' | 'serviceKey'
  > {
  id: string;
  carriedFrom: string | null;
  decision: AuditItem['decision'];
  /** The goal last chosen, kept when the mark is taken back. */
  goalChoice: GoalChoice | null;
  /** The goal the decision makes now (`goalOf`): «Готово» turns it into a goal. */
  goal: GoalKind | null;
  /** «Вдвое меньше» would limit it to this a month; null when it can have no such goal (a service, a one-off purchase). */
  halfLimitMinor: number | null;
  /** What its goal saves a month now: «Лимит 224 000 сум в месяц · экономия 224 000 сум». */
  savingMinor: number;
}

/** A goal with how it goes today (FT-131): the card of «Цели» after the audit and on Home. */
export interface GoalView {
  id: string;
  auditId: string;
  kind: GoalKind;
  name: string;
  categoryId: string;
  /** The category's current name. */
  categoryName: string;
  serviceKey: string | null;
  /**
   * `cancel` only: `subscription` — «цель: отменить», «Уже отменено», «Отмените в самом сервисе»; `tariff` — «цель:
   * отключить», «Уже отключено», «Отключите у оператора». Null for the other goals.
   */
  serviceKind: 'subscription' | 'tariff' | null;
  monthlyMinor: number;
  /** «лимит 175 000 сум в месяц»; 0 unless «Вдвое меньше». */
  limitMinor: number;
  savingMinor: number;
  startsOn: string;
  endsOn: string;
  periodLimitMinor: number;
  spentMinor: number;
  count: number;
  comparison: GoalComparison | null;
  subscription: GoalSubscription | null;
}

export type CombinedComparison = ReturnType<typeof combinedComparison>;

/** `GET /api/audits/current` and the answer of every change of the audit. */
export interface AuditView {
  /** null while it is too early for an audit. */
  id: string | null;
  /** The month audited, YYYY-MM. */
  month: string;
  today: string;
  /** `too_early` — the month was not recorded whole, no audit is kept; `open` — before «Готово»; `done` — after. */
  state: 'too_early' | 'open' | 'done';
  /** Only `too_early`: the day of the first record (null without records) and when the first audit opens. */
  firstRecordDate: string | null;
  firstAuditOn: string | null;
  /** «Следующая ревизия — 1 ноября». */
  nextAuditOn: string;
  /** The audit day: the first «Готово». */
  doneOn: string | null;
  candidates: AuditCandidateView[];
  summary: AuditSummary;
  /** The goals «Готово» made, with how they go; the same as `GET /api/goals` while the audit's month lasts. */
  goals: GoalView[];
  /** «По этим тратам с 1 октября — …, за те же дни сентября — …». */
  comparison: CombinedComparison;
}

/** `GET /api/goals`: the goals counting today — «Цели после ревизии · 4 цели · экономия до 814 000 сум». */
export interface GoalsView {
  today: string;
  /** The audit day and the end of its month; null without goals. */
  startsOn: string | null;
  endsOn: string | null;
  goals: GoalView[];
  planMinor: number;
  comparison: CombinedComparison;
}

/** The audit's reads: today, the real expenses with categories and the rate, and the views of audits and goals. */
export class AuditReader {
  constructor(private sources: AuditSources, private goals: GoalRepository, private now: () => Date) {}

  /** `today` (YYYY-MM-DD) when given — the bot's reminders (FT-133) and tests; else today in Tashkent. */
  today(today?: string): string {
    return isValidDateOnly(today) ? today : todayDateOnly(this.now());
  }

  /** The user's real expenses from `from` to `to` as the audit reads them (`auditRecordsOf`), and their categories. */
  async expenses(userId: string, from: string, to: string): Promise<{ records: AuditRecord[]; categories: Map<string, string> }> {
    const [records, categories] = await Promise.all([this.sources.recordsBetween(userId, from, to), this.sources.categories(userId)]);
    const usdRateMinor = await this.sources.usdRateMinor(userId, records);
    return {
      records: auditRecordsOf(records, { categories, usdRateMinor }),
      categories: new Map(categories.map(category => [category.id, category.name])),
    };
  }

  async goalViews(userId: string, goals: readonly Goal[], today: string): Promise<{ goals: GoalView[]; comparison: CombinedComparison }> {
    if (goals.length === 0) return { goals: [], comparison: null };
    const from = goals.map(goal => `${shiftMonth(goal.startsOn.slice(0, 7), -1)}-01`).sort()[0];
    const to = goals.map(goal => goal.endsOn).sort().reverse()[0];
    const { records, categories } = await this.expenses(userId, from, to);
    const views = [...goals]
      .sort((a, b) => b.monthlyMinor - a.monthlyMinor || a.name.localeCompare(b.name, 'ru'))
      .map(goal => {
        const progress = goalProgress(goal, records, today);
        return {
          id: goal.id,
          auditId: goal.auditId,
          kind: goal.kind,
          name: goal.name,
          categoryId: goal.categoryId,
          categoryName: categories.get(goal.categoryId) ?? '',
          serviceKey: goal.serviceKey,
          serviceKind: goalServiceKind(goal),
          monthlyMinor: goal.monthlyMinor,
          limitMinor: goal.limitMinor,
          savingMinor: goalSavingMinor(goal),
          startsOn: goal.startsOn,
          endsOn: goal.endsOn,
          ...progress,
        };
      });
    return { goals: views, comparison: combinedComparison(views.map(view => view.comparison)) };
  }

  async auditView(audit: Audit, today: string): Promise<AuditView> {
    const { goals, comparison } = audit.doneOn
      ? await this.goalViews(audit.userId, await this.goals.findByAuditId(audit.id), today)
      : { goals: [], comparison: null };
    return {
      id: audit.id,
      month: audit.month,
      today,
      state: audit.doneOn ? 'done' : 'open',
      firstRecordDate: null,
      firstAuditOn: null,
      nextAuditOn: nextAuditOn(today),
      doneOn: audit.doneOn,
      candidates: audit.items.map(candidateView),
      summary: auditSummary(audit.items),
      goals,
      comparison,
    };
  }

  tooEarlyView(today: string, firstRecordDate: string | null, firstAuditOn: string | null): AuditView {
    return {
      id: null,
      month: auditMonthOn(today),
      today,
      state: 'too_early',
      firstRecordDate,
      firstAuditOn,
      nextAuditOn: nextAuditOn(today),
      doneOn: null,
      candidates: [],
      summary: auditSummary([]),
      goals: [],
      comparison: null,
    };
  }
}

export function candidateView(item: AuditItem): AuditCandidateView {
  return {
    id: item.id,
    kind: item.kind,
    kindLabel: item.kindLabel,
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    name: item.name,
    title: item.title,
    amountMinor: item.amountMinor,
    count: item.count,
    recurring: item.recurring,
    monthlyMinor: item.monthlyMinor,
    operations: item.operations,
    previous: item.previous,
    reason: item.reason,
    serviceKey: item.serviceKey,
    carriedFrom: item.carriedFrom,
    decision: item.decision,
    goalChoice: item.goalChoice,
    goal: goalOf(item),
    halfLimitMinor: item.recurring && !isServiceCandidate(item) ? halfLimitMinor(item.monthlyMinor) : null,
    savingMinor: savingOf(item),
  };
}
