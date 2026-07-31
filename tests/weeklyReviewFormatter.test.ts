import { formatWeeklyReviewSummary } from '../src/delivery/messaging/telegram/formatters';
import { WeeklyReviewSummary } from '../src/modules/transaction/application/weeklyReviewService';

const range = {
  startDate: new Date('2026-07-20T00:00:00.000Z'),
  endDate: new Date('2026-07-26T23:59:59.999Z'),
};

describe('Telegram weekly review formatter', () => {
  it('formats real expenses, income, excluded movements, needsReview, and next action in Russian', () => {
    const summary: WeeklyReviewSummary = {
      range,
      realExpenses: 125000,
      income: 7000000,
      excludedMovementsTotal: 2500000,
      excludedMovementsBreakdown: {
        own_transfer: 500000,
        saving_deposit: 2000000,
      },
      needsReview: {
        count: 2,
        total: 400000,
        transactions: [] as any,
      },
      topCategories: [
        { category: 'coffee', amount: 75000 },
        { category: 'taxi', amount: 50000 },
      ],
    };

    const message = formatWeeklyReviewSummary(summary);

    expect(message).toContain('🗓️ <b>Еженедельный обзор</b>');
    expect(message).toContain('20.07–26.07');
    expect(message).toContain('💸 Реальные расходы: 125 000');
    expect(message).toContain('💚 Доходы: 7 000 000');
    expect(message).toContain('↔️ Не расходы: 2 500 000');
    expect(message).toContain('• Перевод себе: 500 000');
    expect(message).toContain('• Вклад / накопление: 2 000 000');
    expect(message).toContain('⚠️ Нужно проверить: 2 операции на 400 000');
    expect(message).toContain('coffee: 75 000');
    expect(message).toContain('taxi: 50 000');
    expect(message).toContain('Открой Mini App');
  });

  it('formats an empty weekly review without noisy zero sections', () => {
    const summary: WeeklyReviewSummary = {
      range,
      realExpenses: 0,
      income: 0,
      excludedMovementsTotal: 0,
      excludedMovementsBreakdown: {},
      needsReview: { count: 0, total: 0, transactions: [] },
      topCategories: [],
    };

    const message = formatWeeklyReviewSummary(summary);

    expect(message).toContain('За неделю нет транзакций для итогов');
    expect(message).not.toContain('Нужно проверить:');
    expect(message).not.toContain('Топ расходов');
  });
});
