/**
 * Самое важное место фазы. Если мини-апп покажет сумму, отличную от той,
 * что показывает бот, доверие к продукту кончится быстрее, чем от любой задержки.
 *
 * Правило расхода ровно одно и снято с getTodaySummary (messageHandlers.ts):
 *
 *     semanticType === 'expense' И needsReview !== true
 *
 * Три запрета, каждый из которых в этом проекте уже разъезжался:
 *   1. не откатываться на type — own_transfer и cash_withdrawal имеют type 'expense';
 *   2. не фильтровать isDebtRelated — бот его не фильтрует, разойдёмся на старых записях;
 *   3. не фильтровать isArchived — репозитории уже отдают только неархивные.
 */
import { describe, it, expect } from 'vitest';
import { isExpense } from './semanticType';
import { monthTotal, lastSevenDays, groupByDay } from './summary';
import type { SemanticType, Transaction } from '../types/transaction';

function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx',
    amount: 1000,
    type: 'expense',
    semanticType: 'expense',
    needsReview: false,
    description: 'Тест',
    date: '2026-08-27',
    userId: 'u',
    category: 'other',
    isArchived: false,
    isDebtRelated: false,
    ...over,
  };
}

describe('что считается расходом', () => {
  const cases: Array<[SemanticType, boolean]> = [
    ['expense', true],
    ['income', false],
    ['own_transfer', false],
    ['saving_deposit', false],
    ['debt', false],
    ['reimbursement', false],
    ['cash_withdrawal', false],
    ['group_payment', false],
  ];

  it.each(cases)('%s → расход: %s', (semanticType, expected) => {
    expect(isExpense(tx({ semanticType }))).toBe(expected);
  });

  it('needsReview исключает запись независимо от типа', () => {
    expect(isExpense(tx({ semanticType: 'expense', needsReview: true }))).toBe(false);
  });

  it('не полагается на type: own_transfer с type expense расходом не является', () => {
    // Перевод себе имеет type 'expense' — откат на него вернул бы переводы
    // в расходы и завысил сумму на порядки.
    expect(isExpense(tx({ semanticType: 'own_transfer', type: 'expense' }))).toBe(false);
  });

  it('не фильтрует isDebtRelated — бот его не фильтрует', () => {
    expect(isExpense(tx({ semanticType: 'expense', isDebtRelated: true }))).toBe(true);
  });

  it('не фильтрует isArchived — репозитории уже отдали только неархивные', () => {
    expect(isExpense(tx({ semanticType: 'expense', isArchived: true }))).toBe(true);
  });
});

describe('сумма за месяц', () => {
  it('складывает только расходы текущего месяца', () => {
    const total = monthTotal(
      [
        tx({ amount: 45000, date: '2026-08-27' }),
        tx({ amount: 32000, date: '2026-08-01' }),
        tx({ amount: 999, date: '2026-07-31' }), // прошлый месяц
      ],
      '2026-08-27'
    );

    expect(total).toBe(77000);
  });

  it('совпадает с тем, что считает бот на том же наборе', () => {
    // Ровно набор из теста telegramMessageHandlers: расход, перевод себе
    // и запись, требующая проверки. Бот показывает 45 000, не 945 000.
    const total = monthTotal(
      [
        tx({ amount: 45000, semanticType: 'expense', needsReview: false, date: '2026-07-31' }),
        tx({ amount: 500000, semanticType: 'own_transfer', needsReview: false, date: '2026-07-31' }),
        tx({ amount: 400000, semanticType: 'expense', needsReview: true, date: '2026-07-31' }),
      ],
      '2026-07-31'
    );

    expect(total).toBe(45000);
  });

  it('месяц определяется префиксом строки, а не разбором даты', () => {
    // new Date('2026-08-01') — это полночь UTC; в браузере с UTC+5
    // getMonth() у неё съезжает. Сравнение строк от часового пояса не зависит.
    const total = monthTotal([tx({ amount: 100, date: '2026-08-01' })], '2026-08-31');

    expect(total).toBe(100);
  });
});

describe('последние семь дней', () => {
  it('возвращает ровно семь дней, последний — сегодня', () => {
    const days = lastSevenDays([], '2026-08-27');

    expect(days).toHaveLength(7);
    expect(days[6].date).toBe('2026-08-27');
    expect(days[0].date).toBe('2026-08-21');
  });

  it('переходит через границу месяца', () => {
    const days = lastSevenDays([], '2026-09-02');

    expect(days.map((d) => d.date)).toEqual([
      '2026-08-27',
      '2026-08-28',
      '2026-08-29',
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
    ]);
  });

  it('пустые дни остаются нулями, а не пропускаются', () => {
    // Неделя, прожитая наполовину, не должна выглядеть прожитой целиком.
    const days = lastSevenDays([tx({ amount: 5000, date: '2026-08-27' })], '2026-08-27');

    expect(days.map((d) => d.total)).toEqual([0, 0, 0, 0, 0, 0, 5000]);
  });

  it('складывает несколько трат одного дня и игнорирует не-расходы', () => {
    const days = lastSevenDays(
      [
        tx({ amount: 25000, date: '2026-08-26' }),
        tx({ amount: 7000, date: '2026-08-26' }),
        tx({ amount: 900000, date: '2026-08-26', semanticType: 'cash_withdrawal' }),
      ],
      '2026-08-27'
    );

    expect(days[5]).toMatchObject({ date: '2026-08-26', total: 32000 });
  });
});

describe('группировка ленты по дням', () => {
  it('группирует по календарному дню, новые сверху', () => {
    const groups = groupByDay([
      tx({ id: 'a', date: '2026-08-25' }),
      tx({ id: 'b', date: '2026-08-27' }),
      tx({ id: 'c', date: '2026-08-27' }),
    ]);

    expect(groups.map((g) => g.date)).toEqual(['2026-08-27', '2026-08-25']);
    expect(groups[0].items.map((t) => t.id)).toEqual(['b', 'c']);
  });

  it('оставляет в ленте не-расходы: их видно, но они не в сумме', () => {
    // Иначе человек не поймёт, куда делся перевод, и решит, что запись пропала.
    const groups = groupByDay([tx({ id: 'transfer', semanticType: 'own_transfer' })]);

    expect(groups[0].items).toHaveLength(1);
  });
});
