import { describe, it, expect } from 'vitest';
import { suggestFromHistory } from './suggestions';
import type { Transaction } from '../types/transaction';

function tx(description: string, over: Partial<Transaction> = {}): Transaction {
  return {
    id: description, amount: 25000, type: 'expense', semanticType: 'expense',
    needsReview: false, description, date: '2026-08-27', userId: 'u',
    category: 'coffee', isArchived: false, isDebtRelated: false, ...over,
  };
}

describe('подсказки из истории', () => {
  it('находит по началу строки без учёта регистра', () => {
    const found = suggestFromHistory([tx('Кофе и завтрак')], 'коф');

    expect(found).toHaveLength(1);
    expect(found[0].description).toBe('Кофе и завтрак');
  });

  it('находит и по слову внутри описания', () => {
    // «Яндекс такси» должно находиться по «такси», иначе подсказки бесполезны
    // ровно там, где описание начинается с названия сервиса.
    expect(suggestFromHistory([tx('Яндекс такси')], 'такси')).toHaveLength(1);
  });

  it('не предлагает по обрывку внутри слова', () => {
    // «фе» не должно вытаскивать «Кофе»: иначе подсказки шумят на каждой букве.
    expect(suggestFromHistory([tx('Кофе')], 'фе')).toHaveLength(0);
  });

  it('схлопывает повторы, оставляя самую свежую', () => {
    const found = suggestFromHistory(
      [
        tx('Кофе', { amount: 25000, date: '2026-08-27' }),
        tx('кофе', { amount: 30000, date: '2026-08-20' }),
      ],
      'кофе'
    );

    expect(found).toHaveLength(1);
    expect(found[0].amount).toBe(25000);
  });

  it('считает, сколько раз повторялась трата', () => {
    const found = suggestFromHistory(
      [tx('Кофе'), tx('кофе'), tx('КОФЕ')],
      'кофе'
    );

    expect(found[0].count).toBe(3);
  });

  it('не предлагает не-расходы: их не добавляют вручную', () => {
    const found = suggestFromHistory(
      [tx('Перевод на Alif', { semanticType: 'own_transfer' })],
      'перевод'
    );

    expect(found).toHaveLength(0);
  });

  it('на пустом запросе молчит, а не вываливает всю историю', () => {
    expect(suggestFromHistory([tx('Кофе')], '')).toHaveLength(0);
    expect(suggestFromHistory([tx('Кофе')], '  ')).toHaveLength(0);
  });

  it('отдаёт не больше трёх: лист и так делит место с клавиатурой', () => {
    const many = ['Кофе 1', 'Кофе 2', 'Кофе 3', 'Кофе 4', 'Кофе 5'].map((d) => tx(d));

    expect(suggestFromHistory(many, 'кофе')).toHaveLength(3);
  });
});
