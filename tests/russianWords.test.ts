import { MONTH_NAMES, MONTHS_IN, MONTHS_OF, plural } from '../src/shared/domain/text/russianWords';
import { formatDaySummary, formatMonthSummary } from '../src/delivery/messaging/telegram/formatters/summaryMessage';
import { formatReminder } from '../src/delivery/messaging/telegram/formatters/reminderMessage';
import { formatLoginQuestion } from '../src/delivery/messaging/telegram/formatters/loginMessage';
import { exportCaption } from '../src/modules/export/infrastructure/TelegramChatFileSender';
import { notSentReason } from '../src/modules/notification/domain/noticeWindow';
import { DaySummary, MonthSummary } from '../src/modules/notification/domain/dailySummary';

/**
 * #281: the month names and the plural rule were copied into every message that writes a date or a count — the bot's
 * record, summary, reminder and login messages, the audit, the export caption, the log of notices not sent. Now there
 * is one copy of each, and the messages read it.
 */
describe('the Russian words next to numbers and dates (#281)', () => {
  it('a count takes the form of its last digits, and 11–14 the «many» one', () => {
    const forms = (n: number) => `${n} ${plural(n, 'запись', 'записи', 'записей')}`;

    expect([0, 1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111, 112, 1_000_001].map(forms)).toEqual([
      '0 записей', '1 запись', '2 записи', '4 записи', '5 записей', '11 записей', '12 записей', '14 записей',
      '21 запись', '22 записи', '25 записей', '101 запись', '111 записей', '112 записей', '1000001 запись',
    ]);
  });

  it('twelve months in three forms, January first', () => {
    for (const months of [MONTHS_OF, MONTHS_IN, MONTH_NAMES]) expect(months).toHaveLength(12);
    expect([MONTHS_OF[0], MONTHS_IN[0], MONTH_NAMES[0]]).toEqual(['января', 'январе', 'Январь']);
    expect([MONTHS_OF[4], MONTHS_IN[4], MONTH_NAMES[4]]).toEqual(['мая', 'мае', 'Май']);
    expect([MONTHS_OF[11], MONTHS_IN[11], MONTH_NAMES[11]]).toEqual(['декабря', 'декабре', 'Декабрь']);
  });

  describe('every message reads the same words', () => {
    const MONTH: MonthSummary = { month: '2026-05', today: '2026-05-09', totalMinor: 0, hasUsd: false, comparison: null, categories: [], usdLeftOut: false };
    const DAY: DaySummary = {
      day: '2026-05-09', recordCount: 22, expenseMinor: 100_000, expenseHasUsd: false, expenseCount: 22, usdLeftOutCount: 0,
      categories: [], needsReviewCount: 0, month: MONTH,
    };

    it('the bot: the summaries, a reminder and the login question', () => {
      expect(formatDaySummary(DAY, { today: DAY.day }).text).toContain(`${MONTHS_OF[4]}`);
      expect(formatDaySummary(DAY, { today: DAY.day }).text).toContain('22 записи');
      expect(formatMonthSummary(MONTH, {}).text).toContain(`<b>${MONTH_NAMES[4]} · 1–9</b>`);
      expect(formatMonthSummary(MONTH, {}).text).toContain(`Трат в ${MONTHS_IN[4]} пока нет.`);
      expect(formatReminder({ kind: 'audit', month: '2026-05', left: 21, repeat: false }, {}).text)
        .toBe('<b>Ревизия мая готова</b>\n21 трата на проверку — пара минут.');
      expect(formatLoginQuestion({ loginId: 'l-1', device: 'Chrome <b>', createdAt: new Date('2026-05-09T07:42:00Z') }, 'Asia/Tashkent').text)
        .toContain('Chrome &lt;b&gt;, 9 мая в 12:42');
    });

    it('the export caption and the log of a notice not sent', () => {
      expect(exportCaption(112, '2026-05-09')).toBe('112 записей на 9 мая — таблица CSV, её откроет Excel или Google Таблицы.');
      expect(notSentReason(22, null)).toBe('не ушло: нет сети, 22 попытки');
    });
  });
});
