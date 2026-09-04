import { describe, it, expect } from 'vitest';
import { getHealthScoreInfo } from './healthScore';

// FT-059: the score encoded one value two ways — the number was orange (warning) while
// the progress bar underneath stayed black (primary). "Хорошо" is not a warning state,
// so warning/orange now starts only where the copy actually asks for attention, and the
// bar reuses the same role as the number.
describe('getHealthScoreInfo', () => {
  it('reads 92 as success', () => {
    const info = getHealthScoreInfo(92);

    expect(info.label).toBe('Отлично');
    expect(info.color).toBe('text-success');
    expect(info.barColor).toBe('bg-success');
  });

  it('does not warn about a "Хорошо" score of 73', () => {
    const info = getHealthScoreInfo(73);

    expect(info.label).toBe('Хорошо');
    expect(info.color).toBe('text-primary');
    expect(info.barColor).toBe('bg-primary');
  });

  it('warns only from the middle band', () => {
    const info = getHealthScoreInfo(45);

    expect(info.label).toBe('Средне');
    expect(info.color).toBe('text-warning');
    expect(info.barColor).toBe('bg-warning');
  });

  it('marks a low score as needing attention', () => {
    const info = getHealthScoreInfo(20);

    expect(info.label).toBe('Требует внимания');
    expect(info.color).toBe('text-expense');
    expect(info.barColor).toBe('bg-expense');
  });

  it('uses one role for the number and the bar at every boundary', () => {
    for (const score of [0, 39, 40, 59, 60, 79, 80, 100]) {
      const { color, barColor } = getHealthScoreInfo(score);
      expect(barColor).toBe(color.replace(/^text-/, 'bg-'));
    }
  });
});
