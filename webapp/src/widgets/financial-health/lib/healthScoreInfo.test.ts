import { describe, it, expect } from 'vitest';
import { getHealthScoreInfo } from './healthScoreInfo';

/**
 * Colour has to follow meaning: `warning` is reserved for states that need
 * attention. A good score painted orange tells the user the opposite of what
 * the label says.
 */
describe('getHealthScoreInfo', () => {
  it('celebrates an excellent score with the success role', () => {
    expect(getHealthScoreInfo(95).color).toBe('text-success');
    expect(getHealthScoreInfo(95).label).toBe('Отлично');
  });

  it('does not warn about a good score', () => {
    const good = getHealthScoreInfo(73);

    expect(good.label).toBe('Хорошо');
    expect(good.color).not.toBe('text-warning');
    expect(good.bgColor).not.toBe('bg-warning');
  });

  it('warns only when the score actually needs attention', () => {
    expect(getHealthScoreInfo(50).color).toBe('text-warning');
    expect(getHealthScoreInfo(50).label).toBe('Средне');
  });

  it('marks a poor score with the expense role', () => {
    expect(getHealthScoreInfo(20).color).toBe('text-expense');
  });

  it('uses only semantic roles, never raw palette classes', () => {
    for (const score of [0, 39, 40, 59, 60, 79, 80, 100]) {
      const info = getHealthScoreInfo(score);
      expect(info.color).toMatch(/^text-(success|warning|expense|foreground)$/);
      expect(info.bgColor).toMatch(/^bg-(success|warning|expense|foreground)$/);
    }
  });

  it('keeps the boundaries where the labels change', () => {
    expect(getHealthScoreInfo(80).label).toBe('Отлично');
    expect(getHealthScoreInfo(79).label).toBe('Хорошо');
    expect(getHealthScoreInfo(60).label).toBe('Хорошо');
    expect(getHealthScoreInfo(59).label).toBe('Средне');
    expect(getHealthScoreInfo(40).label).toBe('Средне');
    expect(getHealthScoreInfo(39).label).toBe('Требует внимания');
  });
});
