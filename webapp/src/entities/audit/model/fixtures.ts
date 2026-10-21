import type { Audit, AuditCandidate, AuditOperation, AuditSummary, Goal, Goals } from './types';

/**
 * Test data: the answers of the audit API (FT-131, FT-142) on the board «Ревизия трат» — its records of August, September
 * and October 1–14 (tests/helpers/auditPrototype.ts), read on 14 October, the board's day. Made by the backend's own use
 * cases, with short ids. `BOARD_OPEN` — «Ревизия · начало»; `BOARD_PROGRESS` — «Ревизия · разобрано 2 из 6» («Доставка
 * еды» — нужно, «Кофе» — лишнее); `BOARD_DONE` — «Ревизия · итог и цели» (лишнее всё, кроме «Второго номера»);
 * `BOARD_GOALS` — `GET /api/goals` after it; `EARLY` — «Ревизия · мало данных» for a user who began on 12 October.
 */

const sum = (value: number) => value * 100;
const ops = (id: string, rows: Array<[day: number, amount: number]>): AuditOperation[] =>
  rows.map(([day, amount], index) => ({ id: `${id}-${index + 1}`, date: `2026-09-${String(day).padStart(2, '0')}`, amountMinor: sum(amount) }));

const undecided = { carriedFrom: null, decision: null, goalChoice: null, goal: null, savingMinor: 0 } as const;

const CANDIDATES: AuditCandidate[] = [
  {
    id: 'delivery', kind: 'more_often', kindLabel: 'Стало чаще', categoryId: 'cat-cafe', categoryName: 'Кафе',
    name: 'Доставка еды', title: 'Доставка еды — 4\u00a0раза', amountMinor: sum(732000), count: 4, recurring: true, monthlyMinor: sum(732000),
    operations: ops('delivery', [[26, 190000], [18, 176000], [11, 186000], [6, 180000]]),
    previous: { count: 2, amountMinor: sum(352000) },
    reason: 'В августе — 2\u00a0раза на 352\u00a0000\u00a0сум: вдвое чаще и на 380\u00a0000\u00a0сум больше.',
    serviceKey: null, halfLimitMinor: sum(366000), ...undecided,
  },
  {
    id: 'headphones', kind: 'large_purchase', kindLabel: 'Крупная покупка', categoryId: 'cat-shopping', categoryName: 'Покупки',
    name: 'Наушники', title: 'Наушники', amountMinor: sum(690000), count: 1, recurring: false, monthlyMinor: 0,
    operations: ops('headphones', [[6, 690000]]),
    previous: { count: 0, amountMinor: 0 },
    reason: 'Самая крупная покупка сентября, 6\u00a0сентября.',
    serviceKey: null, halfLimitMinor: null, ...undecided,
  },
  {
    id: 'coffee', kind: 'frequent_small', kindLabel: 'Часто и понемногу', categoryId: 'cat-cafe', categoryName: 'Кафе',
    name: 'Кофе', title: 'Кофе — 16\u00a0раз', amountMinor: sum(448000), count: 16, recurring: true, monthlyMinor: sum(448000),
    operations: ops('coffee', [29, 27, 25, 23, 21, 19, 17, 15, 12, 9, 8, 6, 5, 3, 2, 1].map((day) => [day, 28000])),
    previous: { count: 9, amountMinor: sum(243000) },
    reason: 'В среднем 28\u00a0000\u00a0сум за раз. В августе — 9\u00a0раз на 243\u00a0000\u00a0сум.',
    serviceKey: null, halfLimitMinor: sum(224000), ...undecided,
  },
  {
    id: 'taxi', kind: 'frequent_small', kindLabel: 'Часто и понемногу', categoryId: 'cat-transport', categoryName: 'Транспорт',
    name: 'Такси', title: 'Такси — 13\u00a0раз', amountMinor: sum(349000), count: 13, recurring: true, monthlyMinor: sum(349000),
    operations: ops('taxi', [
      [29, 25000], [27, 30000], [24, 26000], [20, 32000], [18, 24000], [16, 28000], [14, 25000],
      [12, 26000], [11, 29000], [9, 22000], [7, 31000], [5, 27000], [2, 24000],
    ]),
    previous: { count: 6, amountMinor: sum(160000) },
    reason: 'В среднем 27\u00a0000\u00a0сум за раз. В августе — 6\u00a0раз на 160\u00a0000\u00a0сум.',
    serviceKey: null, halfLimitMinor: sum(175000), ...undecided,
  },
  {
    id: 'second-number', kind: 'tariff', kindLabel: 'Платный тариф', categoryId: 'cat-telecom', categoryName: 'Связь',
    name: 'Второй номер', title: 'Второй номер', amountMinor: sum(50000), count: 1, recurring: true, monthlyMinor: sum(50000),
    operations: ops('second-number', [[3, 50000]]),
    previous: { count: 1, amountMinor: sum(50000) },
    reason: 'Списывается каждый месяц: в августе и в сентябре по 50\u00a0000\u00a0сум.',
    serviceKey: 'second-number', halfLimitMinor: null, ...undecided,
  },
  {
    id: 'kinopoisk', kind: 'subscription', kindLabel: 'Подписка', categoryId: 'cat-telecom', categoryName: 'Связь',
    name: 'Кинопоиск', title: 'Кинопоиск', amountMinor: sum(50000), count: 1, recurring: true, monthlyMinor: sum(50000),
    operations: ops('kinopoisk', [[5, 50000]]),
    previous: { count: 1, amountMinor: sum(50000) },
    reason: 'Списывается каждый месяц: в августе и в сентябре по 50\u00a0000\u00a0сум.',
    serviceKey: 'kinopoisk', halfLimitMinor: null, ...undecided,
  },
];

const summary = (fields: Partial<AuditSummary>): AuditSummary => ({
  count: 6, marked: 0, left: 6, extraCount: 0, needCount: 0, goalCount: 0, totalMinor: sum(2319000), planMinor: 0, wastedMinor: 0,
  carriedCount: 0, carriedTotalMinor: 0, carriedWastedMinor: 0, ...fields,
});

type Marks = Record<string, Pick<AuditCandidate, 'decision' | 'goal' | 'savingMinor'>>;
const marked = (marks: Marks): AuditCandidate[] => CANDIDATES.map((candidate) => ({ ...candidate, ...marks[candidate.id] }));

export const BOARD_OPEN: Audit = {
  id: 'audit-sep', month: '2026-09', today: '2026-10-14', state: 'open', firstRecordDate: null, firstAuditOn: null,
  nextAuditOn: '2026-11-01', doneOn: null, candidates: CANDIDATES, summary: summary({}), goals: [], comparison: null,
};

export const BOARD_PROGRESS: Audit = {
  ...BOARD_OPEN,
  candidates: marked({
    delivery: { decision: 'need', goal: null, savingMinor: 0 },
    coffee: { decision: 'extra', goal: 'half', savingMinor: sum(224000) },
  }),
  summary: summary({ marked: 2, left: 4, extraCount: 1, needCount: 1, goalCount: 1, planMinor: sum(224000), wastedMinor: sum(224000) }),
};

const goal = (fields: Partial<Goal> & Pick<Goal, 'id' | 'kind' | 'name'>): Goal => ({
  auditId: 'audit-sep', categoryId: 'cat-cafe', categoryName: 'Кафе', serviceKey: null, serviceKind: null, monthlyMinor: 0,
  limitMinor: 0, savingMinor: 0, startsOn: '2026-10-14', endsOn: '2026-10-31', periodLimitMinor: 0, spentMinor: 0, count: 0,
  comparison: null, subscription: null, ...fields,
});

const sameDays = (amount: number, previous: number, percent: number) => ({
  from: '2026-10-01', amountMinor: sum(amount), previousFrom: '2026-09-01', previousTo: '2026-09-14', previousMinor: sum(previous), percent,
});

const GOALS: Goal[] = [
  goal({
    id: 'goal-delivery', kind: 'half', name: 'Доставка еды', monthlyMinor: sum(732000), limitMinor: sum(366000), savingMinor: sum(366000),
    periodLimitMinor: sum(213000), comparison: sameDays(0, 366000, -100),
  }),
  goal({
    id: 'goal-coffee', kind: 'half', name: 'Кофе', monthlyMinor: sum(448000), limitMinor: sum(224000), savingMinor: sum(224000),
    periodLimitMinor: sum(130000), comparison: sameDays(103000, 224000, -54),
  }),
  goal({
    id: 'goal-taxi', kind: 'half', name: 'Такси', categoryId: 'cat-transport', categoryName: 'Транспорт', monthlyMinor: sum(349000),
    limitMinor: sum(175000), savingMinor: sum(174000), periodLimitMinor: sum(102000), spentMinor: sum(24000), count: 1,
    comparison: sameDays(262400, 184000, 43),
  }),
  goal({
    id: 'goal-kinopoisk', kind: 'cancel', name: 'Кинопоиск', categoryId: 'cat-telecom', categoryName: 'Связь', serviceKey: 'kinopoisk',
    serviceKind: 'subscription', monthlyMinor: sum(50000), savingMinor: sum(50000),
    subscription: { state: null, lastChargeOn: '2026-10-03', nextChargeOn: '2026-11-03', remindOn: '2026-11-02' },
  }),
];

const COMPARISON = { amountMinor: sum(365400), previousMinor: sum(774000), percent: -53 };

export const BOARD_DONE: Audit = {
  ...BOARD_OPEN,
  state: 'done',
  doneOn: '2026-10-14',
  candidates: marked({
    delivery: { decision: 'extra', goal: 'half', savingMinor: sum(366000) },
    headphones: { decision: 'extra', goal: null, savingMinor: 0 },
    coffee: { decision: 'extra', goal: 'half', savingMinor: sum(224000) },
    taxi: { decision: 'extra', goal: 'half', savingMinor: sum(174000) },
    'second-number': { decision: 'need', goal: null, savingMinor: 0 },
    kinopoisk: { decision: 'extra', goal: 'cancel', savingMinor: sum(50000) },
  }),
  summary: summary({
    marked: 6, left: 0, extraCount: 5, needCount: 1, goalCount: 4, planMinor: sum(814000), wastedMinor: sum(1504000),
  }),
  goals: GOALS,
  comparison: COMPARISON,
};

export const BOARD_GOALS: Goals = {
  today: '2026-10-14', startsOn: '2026-10-14', endsOn: '2026-10-31', goals: GOALS, planMinor: sum(814000), comparison: COMPARISON,
};

export const EARLY: Audit = {
  id: null, month: '2026-09', today: '2026-10-14', state: 'too_early', firstRecordDate: '2026-10-12', firstAuditOn: '2026-12-01',
  nextAuditOn: '2026-11-01', doneOn: null, candidates: [],
  summary: summary({ count: 0, left: 0, totalMinor: 0 }), goals: [], comparison: null,
};
