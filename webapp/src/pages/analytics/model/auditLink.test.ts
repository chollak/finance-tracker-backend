import { describe, expect, it } from 'vitest';
import { BOARD_DONE, BOARD_OPEN, EARLY } from '@/entities/audit/model/fixtures';
import { auditLink } from './auditLink';

/**
 * FT-132, board «Аналитика · прошлый месяц» (Pastel_Analytics.dc.html, `hasAudit`): under the expenses of the month the
 * audit is about, a card leads to it — «Ревизия сентября · Найти траты, без которых можно обойтись».
 */

const september = { month: '2026-09', type: 'expense' as const, hasData: true };

describe('the audit card of analytics', () => {
  it('shows under the expenses of the month audited', () => {
    expect(auditLink(BOARD_OPEN, september)).toEqual({ title: 'Ревизия сентября', subtitle: 'Найти траты, без которых можно обойтись' });
  });

  it('after «Готово» it leads to the result', () => {
    expect(auditLink(BOARD_DONE, september)).toEqual({ title: 'Ревизия сентября', subtitle: 'Итог и цели' });
    expect(auditLink({ ...BOARD_DONE, goals: [] }, september)?.subtitle).toBe('Итог ревизии');
  });

  it('not for another month, the income, an empty month, before the first audit or while it is read', () => {
    expect(auditLink(BOARD_OPEN, { ...september, month: '2026-10' })).toBeNull();
    expect(auditLink(BOARD_OPEN, { ...september, type: 'income' })).toBeNull();
    expect(auditLink(BOARD_OPEN, { ...september, hasData: false })).toBeNull();
    expect(auditLink(EARLY, september)).toBeNull();
    expect(auditLink(undefined, september)).toBeNull();
  });
});
