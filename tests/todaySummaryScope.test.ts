/**
 * getTodaySummary тянул всю историю транзакций пользователя, чтобы посчитать
 * две суммы за текущий месяц, и делал это на каждое входящее сообщение.
 *
 * Замер (scripts/measure-capture-latency.ts, коммит e2df093): 11 мс на тысяче
 * записей и 72 мс на шести тысячах против стабильных 3 мс при выборке
 * по диапазону дат. То есть это гигиена, а не борьба с трением — но выборка
 * по диапазону ещё и не деградирует с ростом истории.
 *
 * Фильтрация по needsReview и countsAsRealExpense остаётся в JS: перенос
 * в SQL продублировал бы логику в двух репозиториях, а они на этом уже
 * расходились (коммит f0ce281).
 */
import { getTodaySummaryForTest } from '../src/delivery/messaging/telegram/handlers/messageHandlers';

type RepoStub = {
  getByUserIdAndDateRange: jest.Mock;
  findByUserId: jest.Mock;
};

function moduleWith(repo: RepoStub) {
  return { getRepository: () => repo } as never;
}

function stubRepo(rows: unknown[] = []): RepoStub {
  return {
    getByUserIdAndDateRange: jest.fn().mockResolvedValue(rows),
    findByUserId: jest.fn().mockResolvedValue(rows),
  };
}

describe('getTodaySummary', () => {
  it('запрашивает только текущий месяц, а не всю историю', async () => {
    const repo = stubRepo();

    await getTodaySummaryForTest(moduleWith(repo), 'user-1');

    expect(repo.getByUserIdAndDateRange).toHaveBeenCalledTimes(1);
    expect(repo.findByUserId).not.toHaveBeenCalled();

    const [userId, startDate] = repo.getByUserIdAndDateRange.mock.calls[0];
    const now = new Date();
    expect(userId).toBe('user-1');
    expect(startDate.getDate()).toBe(1);
    expect(startDate.getMonth()).toBe(now.getMonth());
    expect(startDate.getFullYear()).toBe(now.getFullYear());
  });

  it('считает обе суммы по одному ответу репозитория', async () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0];

    const repo = stubRepo([
      { date: today, amount: 100, type: 'expense', semanticType: 'expense', needsReview: false },
      { date: firstOfMonth, amount: 50, type: 'expense', semanticType: 'expense', needsReview: false },
    ]);

    const summary = await getTodaySummaryForTest(moduleWith(repo), 'user-1');

    expect(summary).toEqual({ todayTotal: 100, monthTotal: 150 });
  });

  it('не считает то, что требует проверки', async () => {
    const today = new Date().toISOString().split('T')[0];
    const repo = stubRepo([
      { date: today, amount: 100, type: 'expense', semanticType: 'expense', needsReview: false },
      { date: today, amount: 999, type: 'expense', semanticType: 'expense', needsReview: true },
    ]);

    const summary = await getTodaySummaryForTest(moduleWith(repo), 'user-1');

    expect(summary).toEqual({ todayTotal: 100, monthTotal: 100 });
  });

  it('не считает расходами то, что расходами не является', async () => {
    const today = new Date().toISOString().split('T')[0];
    const repo = stubRepo([
      { date: today, amount: 100, type: 'expense', semanticType: 'expense', needsReview: false },
      // Перевод себе и снятие наличных — движение денег, а не трата.
      // Продуктовые инварианты запрещают считать их расходом.
      { date: today, amount: 2000000, type: 'expense', semanticType: 'own_transfer', needsReview: false },
      { date: today, amount: 500000, type: 'expense', semanticType: 'cash_withdrawal', needsReview: false },
    ]);

    const summary = await getTodaySummaryForTest(moduleWith(repo), 'user-1');

    expect(summary).toEqual({ todayTotal: 100, monthTotal: 100 });
  });

  it('на отказ репозитория отдаёт undefined, не роняя ответ бота', async () => {
    const repo = stubRepo();
    repo.getByUserIdAndDateRange.mockRejectedValue(new Error('база недоступна'));

    await expect(getTodaySummaryForTest(moduleWith(repo), 'user-1')).resolves.toBeUndefined();
  });
});
