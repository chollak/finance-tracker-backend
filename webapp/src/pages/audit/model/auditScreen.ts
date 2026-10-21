import type { Audit, AuditCandidate, Goal, GoalChoice, SubscriptionAnswer } from '@/entities/audit';
import { dayMonth, monthNameIn, monthNameLower, monthNameOf } from '@/shared/lib/dates';
import { formatMinor } from '@/shared/lib/money';
import { pluralRu } from '@/shared/lib/plural';

/**
 * The texts of the audit screen (FT-132, row «Ревизия трат — что было лишним», design-system «Ревизия трат»;
 * AuditCandidate.md, PlanHero.md, GoalList.md), from the API's answers (FT-131, FT-142). The copy is the board's
 * (design/prototype/Pastel_Audit.dc.html); the numbers are the server's.
 */

const money = (minor: number) => formatMinor(minor, 'UZS');
const bare = (minor: number) => formatMinor(minor, 'UZS', { unit: false });
const monthNumber = (month: string) => Number(month.slice(5, 7));
/** «YYYY-MM» `delta` months away. */
function shiftMonth(month: string, delta: number): string {
  const index = Number(month.slice(0, 4)) * 12 + monthNumber(month) - 1 + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}
const daysInMonth = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), monthNumber(month), 0)).getUTCDate();
const dayNumber = (date: string) => Date.UTC(Number(date.slice(0, 4)), monthNumber(date) - 1, Number(date.slice(8, 10))) / 86_400_000;
const days = (count: number) => `${count} ${pluralRu(count, 'день', 'дня', 'дней')}`;

const isService = (candidate: Pick<AuditCandidate, 'kind'>) => candidate.kind === 'subscription' || candidate.kind === 'tariff';

/** «Ревизия сентября»; before the first audit — «Ревизия трат». */
export function auditScreenTitle(audit: Audit): string {
  return audit.state === 'too_early' ? 'Ревизия трат' : `Ревизия ${monthNameOf(monthNumber(audit.month))}`;
}

/** The list until «Готово»; a done audit, and one where nothing was found, open on the result. */
export function initialAuditView(audit: Audit): 'list' | 'done' {
  return audit.state === 'done' || audit.summary.count === 0 ? 'done' : 'list';
}

export interface TooEarlyView {
  title: string;
  text: string;
  /** «Записей пока — за 3 дня из 31». */
  progress: string;
}

/** «Ревизия · мало данных»: the audit needs a whole month of records (FT-130: begun on one of its first 3 days). */
export function tooEarlyView(audit: Audit): TooEarlyView {
  const text = 'Нужен целый месяц записей: тогда ИИ найдёт траты, которые повторяются или растут, и спросит, нужны ли они.';
  const { firstRecordDate, firstAuditOn, today } = audit;
  if (!firstRecordDate || !firstAuditOn) return { title: 'Первая ревизия — после месяца записей', text, progress: 'Записей пока нет' };

  const wholeMonth = shiftMonth(firstAuditOn.slice(0, 7), -1);
  const title = `Первая ревизия — ${dayMonth(firstAuditOn)}`;
  if (today.slice(0, 7) === wholeMonth) {
    const from = firstRecordDate > `${wholeMonth}-01` ? firstRecordDate : `${wholeMonth}-01`;
    return { title, text, progress: `Записей пока — за ${days(dayNumber(today) - dayNumber(from) + 1)} из ${daysInMonth(wholeMonth)}` };
  }
  // Recording began after the 3rd: the month after is the first whole one
  const recorded = Math.max(1, dayNumber(today) - dayNumber(firstRecordDate) + 1);
  return { title, text, progress: `Записей пока — за ${days(recorded)}, а нужен целый ${monthNameLower(monthNumber(wholeMonth))}` };
}

/** The card on top of the list: what the AI found, how much it took, and «Разобрано 2 из 6». */
export function auditIntro(audit: Audit): { text: string; progress: string; share: number } {
  const { count, marked, carriedCount, totalMinor } = audit.summary;
  const found = count - carriedCount;
  const carriedMonth = audit.candidates.find((candidate) => candidate.carriedFrom)?.carriedFrom;
  const parts: string[] = [];
  if (found > 0) {
    const spendings = pluralRu(found, 'трату, которая может быть лишней', 'траты, которые могут быть лишними', 'трат, которые могут быть лишними');
    parts.push(`ИИ нашёл ${found} ${spendings}, — ${money(totalMinor)} за ${monthNameLower(monthNumber(audit.month))}.`);
  }
  if (carriedCount > 0 && carriedMonth) {
    const audited = monthNameOf(monthNumber(carriedMonth));
    parts.push(found > 0 ? `Ещё ${carriedCount} — из ревизии ${audited}.` : `Новых трат на проверку нет, остались ${carriedCount} из ревизии ${audited}.`);
  }
  parts.push('Отметьте: нужно или лишнее.');
  return { text: parts.join(' '), progress: `Разобрано ${marked} из ${count}`, share: count > 0 ? marked / count : 1 };
}

export interface CandidateCardView {
  /** Retells the kind, the title, the sum and the mark. */
  aria: string;
  /** «Часто и понемногу · Кафе». */
  kindLine: string;
  title: string;
  amount: string;
  /** Before a mark only, with the operations under it. */
  reason: string | null;
  opsLabel: string;
  ops: Array<{ date: string; amount: string }>;
  /** «Показать все 16». */
  moreOps: string | null;
  groupAria: string;
  /** «Что делаем дальше» of a repeating extra: «Вдвое меньше / Отказаться» (`choices`), and what it saves. */
  goal: { choices: boolean; choice: GoalChoice | null; text: string } | null;
  /** Under the choice of a marked card. */
  note: string | null;
}

const SHOWN_OPERATIONS = 5;

/** One candidate's card (AuditCandidate.md): before a mark — the reason and its operations; after — folded to the choice. */
export function candidateCard(candidate: AuditCandidate, view: { open: boolean; allOps: boolean }): CandidateCardView {
  const service = isService(candidate);
  const amount = service && candidate.amountMinor === candidate.monthlyMinor ? `${money(candidate.amountMinor)} в месяц` : money(candidate.amountMinor);
  const carried = candidate.carriedFrom ? ` · за ${monthNameLower(monthNumber(candidate.carriedFrom))}` : '';
  const marked = candidate.decision === 'need' ? '. Отмечено: нужно' : candidate.decision === 'extra' ? '. Отмечено: лишнее' : '';
  const count = candidate.operations.length;
  const shown = view.allOps ? candidate.operations : candidate.operations.slice(0, SHOWN_OPERATIONS);

  let goal: CandidateCardView['goal'] = null;
  if (candidate.decision === 'extra' && candidate.recurring) {
    if (service) {
      const cancel = candidate.kind === 'tariff' ? 'Отключить тариф' : 'Отменить подписку';
      goal = { choices: false, choice: null, text: `${cancel} · экономия ${money(candidate.monthlyMinor)} в месяц` };
    } else {
      const choice = candidate.goalChoice ?? 'half';
      const text =
        choice === 'half'
          ? `Лимит ${money(candidate.halfLimitMinor ?? 0)} в месяц · экономия ${money(candidate.savingMinor)}`
          : `Экономия ${money(candidate.monthlyMinor)} в месяц`;
      goal = { choices: true, choice, text };
    }
  }

  let note: string | null = null;
  if (candidate.decision === 'need') {
    note = candidate.recurring ? 'Предложим снова, только если трата заметно вырастет.' : 'Учтём: такие покупки для вас нормальны.';
  } else if (candidate.decision === 'extra' && !candidate.recurring) {
    note = 'Разовая покупка — цель не нужна. Войдёт в итог «ушло на лишнее».';
  }

  return {
    aria: `${candidate.kindLabel}: ${candidate.title}, ${amount}${marked}`,
    kindLine: `${candidate.kindLabel} · ${candidate.categoryName}${carried}`,
    title: candidate.title,
    amount,
    reason: candidate.decision ? null : candidate.reason,
    opsLabel: view.open
      ? 'Скрыть операции'
      : count === 1
        ? 'Показать операцию'
        : `Показать ${count} ${pluralRu(count, 'операцию', 'операции', 'операций')}`,
    ops: view.open ? shown.map((operation) => ({ date: dayMonth(operation.date), amount: money(operation.amountMinor) })) : [],
    moreOps: view.open && !view.allOps && count > SHOWN_OPERATIONS ? `Показать все ${count}` : null,
    groupAria: `Нужна ли трата «${candidate.name}»`,
    goal,
    note,
  };
}

/** The bottom of the list: the saving and what is left once something is marked; «Готово» after the first mark. */
export function auditFooter(audit: Audit): { plan: string | null; left: string | null; ready: boolean; label: string } {
  const { count, marked, left, extraCount, planMinor } = audit.summary;
  if (marked === 0) return { plan: null, left: null, ready: false, label: 'Отметьте хотя бы одну' };
  return {
    plan: planMinor > 0 ? `Экономия ${money(planMinor)} в месяц` : null,
    left: `${extraCount > 0 ? `Лишнее: ${extraCount} из ${count}` : 'Пока лишнего нет'}${left > 0 ? ` · ${left} разберёте позже` : ''}`,
    ready: true,
    label: 'Готово',
  };
}

export interface AuditResultView {
  /** «Итог · отмечено 6 из 6». */
  heroLabel: string;
  /** The saving a month without a sign, and what went on the extra. */
  plan: { amount: string; text: string } | null;
  /** Without a plan: «Лишнего не нашлось», «Пока лишнего нет», «Цели не нужны». */
  noPlan: { title: string; text: string } | null;
  /** «По этим тратам с 1 октября — …: уже на 53% меньше». */
  trend: string | null;
  goalsSub: string | null;
  /** «Наушники — 690 000 сум». */
  oneOff: string | null;
  need: string | null;
  next: string;
  canEdit: boolean;
}

const percentText = (percent: number, less: string, more: string, same: string) =>
  percent < 0 ? `: ${less} ${Math.abs(percent)}% меньше` : percent > 0 ? `: ${more} ${percent}% больше` : `: ${same}`;

/**
 * The result (PlanHero.md, «Ревизия · итог и цели», «Ревизия · лишнего нет»): a plan, not a reproach. «а у лимита
 * напишем в боте» — only when a goal has a limit the bot watches (FT-133) and «Цели и подписки» is on (`goalAlertsEnabled`,
 * on until the settings say otherwise).
 */
export function auditResult(audit: Audit, options: { goalAlertsEnabled?: boolean } = {}): AuditResultView {
  const month = monthNumber(audit.month);
  const { count, marked, left, extraCount, planMinor, wastedMinor, goalCount } = audit.summary;

  let noPlan: AuditResultView['noPlan'] = null;
  if (planMinor === 0) {
    if (count === 0) {
      noPlan = { title: 'Лишнего не нашлось', text: `Траты ${monthNameOf(month)} обычные: ничего не выросло и не повторялось сверх привычного.` };
    } else if (extraCount === 0 && left === 0) {
      noPlan = { title: 'Лишнего не нашлось', text: 'Все траты вы отметили как нужные.' };
    } else if (extraCount === 0) {
      noPlan = { title: 'Пока лишнего нет', text: `Нужными отмечено ${marked} из ${count}. Остальные разберёте позже.` };
    } else {
      noPlan = { title: 'Цели не нужны', text: 'Лишнее — только разовые покупки, их не нужно ограничивать.' };
    }
  }

  const goalsMonth = monthNumber(audit.doneOn ?? audit.today);
  const trend = audit.comparison
    ? `По этим тратам с 1 ${monthNameOf(goalsMonth)} — ${money(audit.comparison.amountMinor)}, за те же дни ${monthNameOf(month)} — ` +
      `${money(audit.comparison.previousMinor)}${percentText(audit.comparison.percent, 'уже на', 'пока на', 'пока столько же')}`
    : null;

  const oneOffs = audit.candidates.filter((candidate) => candidate.decision === 'extra' && !candidate.recurring);
  const needed = audit.candidates.filter((candidate) => candidate.decision === 'need');
  // What a brought candidate left undecided again does not come once more (FT-131)
  const comingBack = audit.candidates.filter((candidate) => candidate.decision === null && candidate.carriedFrom === null).length;
  const nextMonth = monthNumber(shiftMonth(audit.nextAuditOn.slice(0, 7), -1));
  const botWatchesLimit = (options.goalAlertsEnabled ?? true) && audit.candidates.some((candidate) => candidate.goal === 'half');
  const goalsLine = goalCount > 0 ? (botWatchesLimit ? 'Цели появятся на главной, а у лимита напишем в боте. ' : 'Цели появятся на главной. ') : '';
  const next =
    `${goalsLine}Следующая ревизия — ${dayMonth(audit.nextAuditOn)}, за ${monthNameLower(nextMonth)}.` +
    (comingBack > 0
      ? ` В неё войдут и ${comingBack} ${pluralRu(comingBack, 'неразобранная трата', 'неразобранные траты', 'неразобранных трат')}.`
      : '');

  return {
    heroLabel: count > 0 ? `Итог · отмечено ${marked} из ${count}` : `Итог · ${monthNameLower(month)}`,
    plan:
      planMinor > 0
        ? {
            amount: bare(planMinor),
            text: `Столько сэкономите, если держаться целей.${wastedMinor > 0 ? ` В ${monthNameIn(month)} на лишнее ушло ${money(wastedMinor)}.` : ''}`,
          }
        : null,
    noPlan,
    trend,
    goalsSub: audit.doneOn ? `Считаем с ${dayMonth(audit.doneOn)} — дня ревизии` : null,
    oneOff: oneOffs.length > 0 ? oneOffs.map((candidate) => `${candidate.name} — ${money(candidate.amountMinor)}`).join(', ') : null,
    need: needed.length > 0 ? needed.map((candidate) => candidate.name).join(', ') : null,
    next,
    canEdit: count > 0,
  };
}

/** What a subscription or an operator's tariff is called on its goal (FT-142 `serviceKind`). */
const SERVICE_WORDS = {
  subscription: {
    goal: 'цель: отменить',
    where: 'Отмените в самом сервисе до этой даты.',
    whereNoDate: 'Отмените в самом сервисе.',
    done: 'Уже отменено',
    doneStatus: 'Отменено — больше не спишут',
  },
  tariff: {
    goal: 'цель: отключить',
    where: 'Отключите у оператора до этой даты.',
    whereNoDate: 'Отключите у оператора.',
    done: 'Уже отключено',
    doneStatus: 'Отключено — больше не спишут',
  },
} as const;

const serviceWords = (goal: Goal) => SERVICE_WORDS[goal.serviceKind ?? 'subscription'];

export interface GoalRowView {
  name: string;
  /** «лимит 175 000 сум в месяц», «цель: отказаться», «цель: отменить». */
  goal: string;
  /** «Вдвое меньше»: the share of the limit since the audit day, 0…1; null for the other goals. */
  bar: number | null;
  status: string;
  trend: string | null;
  actions: { done: { label: string; aria: string }; remind: { label: string; aria: string } | null } | null;
}

/** One goal of «Цели» (GoalList.md). */
export function goalRow(goal: Goal): GoalRowView {
  const end = dayMonth(goal.endsOn);
  let goalText: string;
  let bar: number | null = null;
  let status: string;
  let actions: GoalRowView['actions'] = null;

  if (goal.kind === 'cancel') {
    const words = serviceWords(goal);
    const subscription = goal.subscription;
    const next = subscription?.nextChargeOn ? dayMonth(subscription.nextChargeOn) : null;
    goalText = words.goal;
    if (subscription?.state === 'cancelled') {
      status = words.doneStatus;
    } else {
      if (subscription?.state === 'remind' && subscription.remindOn) {
        status = `Напомним в боте ${dayMonth(subscription.remindOn)}.${next ? ` Следующее списание — ${next}.` : ''}`;
      } else {
        status = next ? `Следующее списание — ${next}. ${words.where}` : words.whereNoDate;
      }
      const remindOn = subscription?.state !== 'remind' ? subscription?.remindOn : null;
      actions = {
        done: { label: words.done, aria: `${words.done}: ${goal.name}` },
        remind: remindOn ? { label: `Напомнить ${dayMonth(remindOn)}`, aria: `Напомнить про «${goal.name}» ${dayMonth(remindOn)}` } : null,
      };
    }
  } else if (goal.kind === 'drop') {
    goalText = 'цель: отказаться';
    status = goal.spentMinor === 0 ? 'Пока ни разу' : `Потрачено ${money(goal.spentMinor)}`;
  } else {
    goalText = `лимит ${money(goal.limitMinor)} в месяц`;
    bar = goal.periodLimitMinor > 0 ? Math.min(1, goal.spentMinor / goal.periodLimitMinor) : goal.spentMinor > 0 ? 1 : 0;
    status =
      goal.spentMinor <= goal.periodLimitMinor
        ? `Потрачено ${bare(goal.spentMinor)} из ${money(goal.periodLimitMinor)} до ${end}`
        : `Потрачено ${money(goal.spentMinor)} — на ${bare(goal.spentMinor - goal.periodLimitMinor)} больше лимита до ${end}`;
  }

  let trend: string | null = null;
  const comparison = goal.kind === 'cancel' ? null : goal.comparison;
  if (comparison) {
    const before = `за те же дни ${monthNameOf(monthNumber(comparison.previousFrom))} — ${money(comparison.previousMinor)}`;
    trend =
      comparison.amountMinor === 0
        ? `С ${dayMonth(comparison.from)} — ни разу, а ${before}`
        : `С ${dayMonth(comparison.from)} — ${money(comparison.amountMinor)}, ${before}${percentText(comparison.percent, 'на', 'на', 'столько же')}`;
  }

  return { name: goal.name, goal: goalText, bar, status, trend, actions };
}

/** What a screen reader hears after «Уже отменено» or «Напомнить». */
export function goalLiveText(goal: Goal, answer: SubscriptionAnswer): string {
  const words = serviceWords(goal);
  if (answer === 'cancelled') return `${goal.name}: ${words.doneStatus.charAt(0).toLocaleLowerCase('ru-RU')}${words.doneStatus.slice(1)}`;
  if (answer === 'remind' && goal.subscription?.remindOn) return `Напомним про «${goal.name}» ${dayMonth(goal.subscription.remindOn)}`;
  return '';
}
