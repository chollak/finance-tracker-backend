import { describe, expect, it } from 'vitest';
import { applyCandidateChange, type Audit, type Goals } from '@/entities/audit';
import { BOARD_DONE, BOARD_GOALS, BOARD_OPEN, BOARD_PROGRESS, EARLY } from '@/entities/audit/model/fixtures';
import { auditHomeCard, snoozedUntilTomorrow } from './auditHomeCard';

/**
 * FT-132, InviteCard.md, boards «Главная» and «Главная после ревизии · цели»: one card under the month tiles — the
 * invitation to the audit with «Позже» while it waits, «Цели после ревизии» after it, nothing when there is nothing.
 */

const NB = ' ';
const noGoals: Goals = { ...BOARD_GOALS, startsOn: null, endsOn: null, goals: [], planMinor: 0, comparison: null };

describe('the card on Home', () => {
  it('invites to the audit of the month before: how many spendings wait, «пара минут»', () => {
    expect(auditHomeCard({ audit: BOARD_OPEN, goals: noGoals, snoozedUntil: null })).toEqual({
      kind: 'invite',
      title: 'Ревизия сентября',
      subtitle: '6 трат на проверку · пара минут',
      aria: 'Ревизия сентября: 6 трат на проверку. Открыть',
    });
  });

  it('counts what is still to decide; all decided — «Готово» is what is left', () => {
    expect(auditHomeCard({ audit: BOARD_PROGRESS, goals: noGoals, snoozedUntil: null })?.subtitle).toBe('4 траты на проверку · пара минут');
    const allMarked = BOARD_OPEN.candidates.reduce((audit, entry) => applyCandidateChange(audit, entry.id, { decision: 'need' }), BOARD_OPEN);
    expect(auditHomeCard({ audit: allMarked, goals: noGoals, snoozedUntil: null })?.subtitle).toBe('Всё отмечено — осталось нажать «Готово»');
  });

  it('«Позже» hides it until tomorrow: hidden while the day it was put off to has not come', () => {
    expect(snoozedUntilTomorrow(BOARD_OPEN)).toBe('2026-10-15');
    expect(auditHomeCard({ audit: BOARD_OPEN, goals: noGoals, snoozedUntil: '2026-10-15' })).toBeNull();
    expect(auditHomeCard({ audit: { ...BOARD_OPEN, today: '2026-10-15' }, goals: noGoals, snoozedUntil: '2026-10-15' })?.kind).toBe('invite');
  });

  it('no card without candidates, before the first audit, or when the audit was not read', () => {
    const nothing: Audit = { ...BOARD_OPEN, candidates: [], summary: { ...BOARD_OPEN.summary, count: 0, left: 0 } };
    expect(auditHomeCard({ audit: nothing, goals: noGoals, snoozedUntil: null })).toBeNull();
    expect(auditHomeCard({ audit: EARLY, goals: noGoals, snoozedUntil: null })).toBeNull();
    expect(auditHomeCard({ audit: undefined, goals: undefined, snoozedUntil: null })).toBeNull();
  });

  it('after the audit its place is «Цели после ревизии» with the goals and the saving', () => {
    expect(auditHomeCard({ audit: BOARD_DONE, goals: BOARD_GOALS, snoozedUntil: null })).toEqual({
      kind: 'goals',
      title: 'Цели после ревизии',
      subtitle: `4 цели · экономия до 814${NB}000${NB}сум`,
      aria: `Цели после ревизии: 4 цели, экономия до 814${NB}000${NB}сум в месяц. Открыть`,
    });
    const one: Goals = { ...BOARD_GOALS, goals: BOARD_GOALS.goals.slice(3), planMinor: 5_000_000 };
    expect(auditHomeCard({ audit: BOARD_DONE, goals: one, snoozedUntil: null })?.subtitle).toBe(`1 цель · экономия до 50${NB}000${NB}сум`);
  });

  it('a done audit without goals leaves no card', () => {
    expect(auditHomeCard({ audit: { ...BOARD_DONE, goals: [] }, goals: noGoals, snoozedUntil: null })).toBeNull();
  });

  it('the goals show even when the audit could not be read', () => {
    expect(auditHomeCard({ audit: undefined, goals: BOARD_GOALS, snoozedUntil: null })?.kind).toBe('goals');
  });
});
