import { describe, expect, it } from 'vitest';
import { applyCandidateChange, applyGoalAnswer } from './applyChange';
import { BOARD_DONE, BOARD_OPEN, BOARD_PROGRESS } from './fixtures';
import type { Audit, AuditCandidate } from './types';

/**
 * FT-132: a press on «Нужно / Лишнее» or «Вдвое меньше / Отказаться» shows at once — the card, the footer's saving and
 * «Лишнее: 1 из 6» — before the server answers; the numbers are the server's own rules (FT-131, FT-142), proven here on
 * the board's answers.
 */

const candidate = (audit: Audit, id: string): AuditCandidate => audit.candidates.find((entry) => entry.id === id)!;

function press(audit: Audit, changes: Array<[string, Parameters<typeof applyCandidateChange>[2]]>): Audit {
  return changes.reduce((current, [id, change]) => applyCandidateChange(current, id, change), audit);
}

describe('a press on a candidate', () => {
  it('«Нужно» on «Доставка еды» and «Лишнее» on «Кофе» give the board «разобрано 2 из 6», as the server counts it', () => {
    const after = press(BOARD_OPEN, [['delivery', { decision: 'need' }], ['coffee', { decision: 'extra' }]]);

    expect(after.candidates).toEqual(BOARD_PROGRESS.candidates);
    expect(after.summary).toEqual(BOARD_PROGRESS.summary);
  });

  it('the board’s marks give its result: 814 000 сум a month, 1 504 000 сум on the extra', () => {
    const after = press(BOARD_OPEN, [
      ['coffee', { decision: 'extra' }],
      ['taxi', { decision: 'extra' }],
      ['delivery', { decision: 'extra' }],
      ['kinopoisk', { decision: 'extra' }],
      ['headphones', { decision: 'extra' }],
      ['second-number', { decision: 'need' }],
    ]);

    expect(after.candidates).toEqual(BOARD_DONE.candidates);
    expect(after.summary).toEqual(BOARD_DONE.summary);
  });

  it('a second press takes the mark back; the goal chosen is kept for the next «Лишнее»', () => {
    let after = press(BOARD_OPEN, [['coffee', { decision: 'extra' }], ['coffee', { goal: 'drop' }]]);
    expect(candidate(after, 'coffee')).toMatchObject({ decision: 'extra', goalChoice: 'drop', goal: 'drop', savingMinor: 44_800_000 });
    expect(after.summary).toMatchObject({ marked: 1, planMinor: 44_800_000, wastedMinor: 44_800_000 });

    after = applyCandidateChange(after, 'coffee', { decision: null });
    expect(candidate(after, 'coffee')).toMatchObject({ decision: null, goalChoice: 'drop', goal: null, savingMinor: 0 });
    expect(after.summary).toMatchObject({ marked: 0, left: 6, extraCount: 0, planMinor: 0, wastedMinor: 0 });

    after = applyCandidateChange(after, 'coffee', { decision: 'extra' });
    expect(candidate(after, 'coffee')).toMatchObject({ goal: 'drop', savingMinor: 44_800_000 });
  });

  it('«Вдвое меньше» counts only the part above the limit as wasted; a subscription is «Отменить», a purchase gets no goal', () => {
    const after = press(BOARD_OPEN, [['taxi', { decision: 'extra' }], ['kinopoisk', { decision: 'extra' }], ['headphones', { decision: 'extra' }]]);

    expect(candidate(after, 'taxi')).toMatchObject({ goal: 'half', savingMinor: 17_400_000 });
    expect(candidate(after, 'kinopoisk')).toMatchObject({ goal: 'cancel', savingMinor: 5_000_000 });
    expect(candidate(after, 'headphones')).toMatchObject({ goal: null, savingMinor: 0 });
    // Wasted: 349 000 − 175 000 + 50 000 + 690 000
    expect(after.summary).toMatchObject({ goalCount: 2, planMinor: 22_400_000, wastedMinor: 91_400_000 });
  });

  it('a candidate brought from the audit before counts apart from the month audited', () => {
    const carried: Audit = {
      ...BOARD_OPEN,
      candidates: BOARD_OPEN.candidates.map((entry) => (entry.id === 'taxi' ? { ...entry, carriedFrom: '2026-08' } : entry)),
    };

    const after = applyCandidateChange(carried, 'taxi', { decision: 'extra' });

    expect(after.summary).toMatchObject({
      totalMinor: 231_900_000 - 34_900_000, carriedCount: 1, carriedTotalMinor: 34_900_000, wastedMinor: 0, carriedWastedMinor: 17_400_000,
      planMinor: 17_400_000,
    });
  });

  it('a press on a candidate the audit no longer has changes nothing', () => {
    expect(applyCandidateChange(BOARD_OPEN, 'gone', { decision: 'need' })).toBe(BOARD_OPEN);
  });
});

describe('an answer about a subscription to cancel', () => {
  const kinopoisk = BOARD_DONE.goals.find((goal) => goal.id === 'goal-kinopoisk')!;

  it('«Уже отменено» leaves nothing to remind', () => {
    expect(applyGoalAnswer(kinopoisk, 'cancelled').subscription).toEqual({ ...kinopoisk.subscription, state: 'cancelled', remindOn: null });
  });

  it('«Напомнить» keeps the day before the charge', () => {
    expect(applyGoalAnswer(kinopoisk, 'remind').subscription).toEqual({ ...kinopoisk.subscription, state: 'remind', remindOn: '2026-11-02' });
  });

  it('a goal that is not a subscription stays as it is', () => {
    const taxi = BOARD_DONE.goals.find((goal) => goal.id === 'goal-taxi')!;
    expect(applyGoalAnswer(taxi, 'cancelled')).toBe(taxi);
  });
});
