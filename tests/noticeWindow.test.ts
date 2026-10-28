import { NOTICE_WINDOW, isCatchUpTime, lastDayToSend, notSentReason } from '../src/modules/notification/domain/noticeWindow';

/**
 * FT-164 (decision 2026-10-29): a notice whose request never left the machine waits and is tried again until its last
 * day on the user's clock, then is kept as failed with the reason; a summary missed by midnight is caught up the next
 * morning, not at night.
 */
describe('the window of a notice that did not leave (FT-164)', () => {
  it('a goal may come the next day; the rest only on the day of their first try', () => {
    expect(lastDayToSend('goal_near', '2026-10-27')).toBe('2026-10-28');
    expect(lastDayToSend('goal_over', '2026-10-31')).toBe('2026-11-01');
    expect(lastDayToSend('daily_summary', '2026-10-27')).toBe('2026-10-27');
    expect(lastDayToSend('daily_summary_late', '2026-10-28')).toBe('2026-10-28');
    expect(lastDayToSend('subscription', '2026-11-02')).toBe('2026-11-02');
    expect(lastDayToSend('audit', '2026-11-01')).toBe('2026-11-01');
    expect(lastDayToSend('audit_again', '2026-11-02')).toBe('2026-11-02');
  });

  it('«Итоги за вчера» do not wake anyone: from 08:00 on the user\'s clock', () => {
    expect(NOTICE_WINDOW.catchUpFrom).toBe('08:00');
    expect(isCatchUpTime('00:00')).toBe(false);
    expect(isCatchUpTime('07:59')).toBe(false);
    expect(isCatchUpTime('08:00')).toBe(true);
    expect(isCatchUpTime('23:59')).toBe(true);
  });

  it('the reason kept with it: how many attempts and the last error', () => {
    const error = 'getaddrinfo ENOTFOUND api.telegram.org';
    expect(notSentReason(1, error)).toBe('не ушло: нет сети, 1 попытка, последняя ошибка getaddrinfo ENOTFOUND api.telegram.org');
    expect(notSentReason(2, error)).toBe('не ушло: нет сети, 2 попытки, последняя ошибка getaddrinfo ENOTFOUND api.telegram.org');
    expect(notSentReason(5, error)).toBe('не ушло: нет сети, 5 попыток, последняя ошибка getaddrinfo ENOTFOUND api.telegram.org');
    expect(notSentReason(11, error)).toContain('11 попыток');
    expect(notSentReason(12, error)).toContain('12 попыток');
    expect(notSentReason(21, error)).toContain('21 попытка');
    expect(notSentReason(22, error)).toContain('22 попытки');
    expect(notSentReason(3, null)).toBe('не ушло: нет сети, 3 попытки');
    expect(notSentReason(0, null)).toBe('не ушло: ни одной попытки — бот не работал');
  });

  it('a long error is cut so the reason fits the column', () => {
    expect(notSentReason(1, 'x'.repeat(1_000)).length).toBe(500);
  });
});
