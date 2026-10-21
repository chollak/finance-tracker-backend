import { Markup } from 'telegraf';
import { AnsweredSubscription, LimitGoal, ReminderNotice, SubscriptionAnswer, SubscriptionDue } from '../../../../modules/notification/domain/reminders';
import { absoluteDate, amountDigits, amountWithUnit, escapeHtml, plural } from './recordMessage';
import { appLinkRows, BotNotice } from './summaryMessage';

/**
 * The bot's reminders after the audit (FT-133, docs/pastel/components/BotNotice.md, board «Бот · напоминания»). A bold
 * line says what happened, the next one what is left or what to do; italic, after an empty line, when the bot writes
 * again. No emoji; links to the app in rows of their own, answers in one row.
 *
 *   Цель «Такси»: 84 000 из 102 000 сум                ← bold
 *   До конца октября по лимиту осталось 18 000 сум.
 *
 *   Напишу ещё раз, только если лимит будет превышен.   ← italic
 *   [ Открыть цели ↗ ]
 *
 *   3 ноября Кинопоиск спишет 50 000 сум               ← bold
 *   В ревизии вы решили отменить подписку. Отменить можно только в самом сервисе.
 *   [ Отменено ] [ Оставить ]
 *
 *   Ревизия октября готова                              ← bold
 *   5 трат на проверку — пара минут.
 *   [ Открыть ревизию ↗ ]
 *   [ Позже ]
 */

const MONTHS_OF = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_IN = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];

/** «Позже» under the audit call: the month audited and how many spendings the call named. */
export const AUDIT_LATER_PATTERN = /^n:later:(\d{4}-\d{2}):(\d{1,4})$/;
/** «Отменено» (`ok`) or «Оставить» (`keep`) under a subscription reminder; 47 bytes of the 64 Telegram allows. */
export const SUBSCRIPTION_ANSWER_PATTERN = /^n:sub:(ok|keep):([0-9a-f-]{36})$/;

export function auditLaterCallback(month: string, left: number): string {
  return `n:later:${month}:${left}`;
}

export function subscriptionAnswerCallback(answer: SubscriptionAnswer, goalId: string): string {
  return `n:sub:${answer === 'cancelled' ? 'ok' : 'keep'}:${goalId}`;
}

export function subscriptionAnswerOf(code: string): SubscriptionAnswer {
  return code === 'ok' ? 'cancelled' : 'keep';
}

const monthIndex = (date: string) => Number(date.slice(5, 7)) - 1;
const som = (minor: number) => amountWithUnit(minor, 'UZS');

/** A subscription is cancelled in the service; an operator's paid tariff is switched off at the operator (FT-142). */
const SERVICE_WORDS = {
  subscription: {
    decided: 'В ревизии вы решили отменить подписку. Отменить можно только в самом сервисе.',
    done: 'Отменено',
    doneTitle: (name: string) => `${name}: подписка отменена`,
    goal: 'отменить',
    again: 'Подписка',
  },
  tariff: {
    decided: 'В ревизии вы решили отключить платный тариф. Отключить можно только у оператора.',
    done: 'Отключено',
    doneTitle: (name: string) => `${name}: тариф отключён`,
    goal: 'отключить',
    again: 'Тариф',
  },
} as const;

/** «5 трат на проверку — пара минут.» */
const waitingLine = (left: number) => `${left} ${plural(left, 'трата', 'траты', 'трат')} на проверку — пара минут.`;

function goalNotice(kind: 'goal_near' | 'goal_over', goal: LimitGoal, appUrl: string | undefined): BotNotice {
  const month = monthIndex(goal.endsOn);
  const title = `<b>Цель «${escapeHtml(goal.name)}»: ${amountDigits(goal.spentMinor, 'UZS')} из ${som(goal.limitMinor)}</b>`;
  const lines = kind === 'goal_near'
    ? [title, `До конца ${MONTHS_OF[month]} по лимиту осталось ${som(goal.limitMinor - goal.spentMinor)}.`, '', '<i>Напишу ещё раз, только если лимит будет превышен.</i>']
    : [title, `Лимит до конца ${MONTHS_OF[month]} превышен на ${som(goal.spentMinor - goal.limitMinor)}.`, '', `<i>Больше об этой цели в ${MONTHS_IN[month]} не напишу.</i>`];
  return { text: lines.join('\n'), keyboard: appLinkRows('Открыть цели', appUrl) };
}

function subscriptionNotice(goal: SubscriptionDue, today: string): BotNotice {
  const words = SERVICE_WORDS[goal.serviceKind];
  return {
    text: `<b>${absoluteDate(goal.chargeOn, today)} ${escapeHtml(goal.name)} спишет ${som(goal.chargeMinor)}</b>\n${words.decided}`,
    keyboard: [[
      Markup.button.callback(words.done, subscriptionAnswerCallback('cancelled', goal.id)),
      Markup.button.callback('Оставить', subscriptionAnswerCallback('keep', goal.id)),
    ]],
  };
}

/**
 * The audit call: «Открыть ревизию ↗» and, on the first call, «Позже». After «Позже» — when the bot calls again
 * (`later`), or nothing when «Звать на ревизию» is off; the second call says the bot will not call again (`repeat`).
 */
export function formatAuditCall(
  call: { month: string; left: number },
  options: { appUrl?: string; today?: string; later?: { on: string; time: string } | 'off'; repeat?: boolean } = {}
): BotNotice {
  const head = `<b>Ревизия ${MONTHS_OF[monthIndex(`${call.month}-01`)]} готова</b>\n${waitingLine(call.left)}`;
  const links = appLinkRows('Открыть ревизию', options.appUrl);
  if (options.repeat) return { text: `${head}\n\n<i>Больше не напомню — ревизия ждёт на главной.</i>`, keyboard: links };
  if (options.later === 'off') return { text: head, keyboard: links };
  if (options.later) {
    const day = absoluteDate(options.later.on, options.today ?? options.later.on);
    return { text: `${head}\n\n<i>Напомню ${day} в ${options.later.time}, один раз.</i>`, keyboard: links };
  }
  return { text: head, keyboard: [...links, [Markup.button.callback('Позже', auditLaterCallback(call.month, call.left))]] };
}

/** A reminder as the scheduler sends it; `appUrl` opens the audit — its screen shows the goals after «Готово». */
export function formatReminder(notice: ReminderNotice, options: { appUrl?: string }): BotNotice {
  switch (notice.kind) {
    case 'goal_near':
    case 'goal_over':
      return goalNotice(notice.kind, notice.goal, options.appUrl);
    case 'subscription':
      return subscriptionNotice(notice.goal, notice.today);
    case 'audit':
      return formatAuditCall(notice, { appUrl: options.appUrl, repeat: notice.repeat });
  }
}

/** «Отменено» or «Оставить» pressed: the reminder becomes the answer, without buttons. */
export function formatSubscriptionAnswer(subscription: AnsweredSubscription, answer: SubscriptionAnswer): BotNotice {
  const words = SERVICE_WORDS[subscription.serviceKind];
  const name = escapeHtml(subscription.name);
  if (answer === 'cancelled') {
    return { text: `<b>${words.doneTitle(name)}</b>\nМинус ${som(subscription.monthlyMinor)} в месяц. Цель из ревизии выполнена.`, keyboard: [] };
  }
  return {
    text: `<b>${name} остаётся</b>\nЦель «${words.goal}» снята. ${words.again} снова попадёт в ревизию, только если подорожает.`,
    keyboard: [],
  };
}
