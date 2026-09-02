import { buildCaptureAck } from '../src/modules/quickCapture/application/buildCaptureAck';
import { CapturedTransaction } from '../src/modules/quickCapture/domain/quickCaptureTypes';

const TODAY = '2026-09-02';

function captured(overrides: Partial<CapturedTransaction> = {}): CapturedTransaction {
  return {
    id: 'tx-1',
    amount: 18000,
    type: 'expense',
    semanticType: 'expense',
    category: 'transport',
    description: 'такси',
    merchant: 'такси',
    date: TODAY,
    needsReview: false,
    countsAsRealExpense: true,
    ...overrides,
  };
}

describe('buildCaptureAck', () => {
  describe('nothing captured', () => {
    it('reports that no operation was found and offers no actions', () => {
      const ack = buildCaptureAck([], { today: TODAY });

      expect(ack.title).toBe('Не нашёл операцию');
      expect(ack.actions).toEqual([]);
      expect(ack.summary.length).toBeGreaterThan(0);
    });

    it('does not crash on an empty list without options', () => {
      expect(() => buildCaptureAck([])).not.toThrow();
    });
  });

  describe('single transaction', () => {
    it('summarises label, grouped amount and localized category', () => {
      const ack = buildCaptureAck([captured()], { today: TODAY });

      expect(ack.title).toBe('Записал');
      expect(ack.summary).toBe('Такси · 18 000 сум · Транспорт');
      expect(ack.details).toBe('Сегодня');
      expect(ack.actions).toEqual(['edit', 'delete']);
    });

    it('marks income with a plus sign', () => {
      const ack = buildCaptureAck(
        [captured({ type: 'income', semanticType: 'income', category: 'salary', description: 'зарплата', amount: 12_000_000, countsAsRealExpense: false })],
        { today: TODAY }
      );

      expect(ack.summary).toBe('Зарплата · +12 000 000 сум · Зарплата');
      expect(ack.details).toBe('Сегодня');
    });

    it('warns that an own transfer does not count as an expense', () => {
      const ack = buildCaptureAck(
        [captured({ semanticType: 'own_transfer', category: 'transfer', description: 'перевел на Alif', amount: 500000, countsAsRealExpense: false })],
        { today: TODAY }
      );

      expect(ack.summary).toBe('Перевел на Alif · 500 000 сум · Перевод');
      expect(ack.details).toBe('Сегодня · Не входит в расходы');
    });

    it('switches title and actions when the transaction needs review', () => {
      const ack = buildCaptureAck([captured({ needsReview: true })], { today: TODAY });

      expect(ack.title).toBe('Нужно проверить');
      expect(ack.actions).toEqual(['edit', 'delete', 'review']);
    });

    it('shows the raw date when the transaction is not from today', () => {
      const ack = buildCaptureAck([captured({ date: '2026-08-30' })], { today: TODAY });

      expect(ack.details).toBe('2026-08-30');
    });

    it('falls back to the merchant, then to the category name, for the label', () => {
      expect(buildCaptureAck([captured({ description: undefined, merchant: 'яндекс' })], { today: TODAY }).summary)
        .toBe('Яндекс · 18 000 сум · Транспорт');

      expect(buildCaptureAck([captured({ description: undefined, merchant: undefined })], { today: TODAY }).summary)
        .toBe('Транспорт · 18 000 сум');
    });

    it('keeps an unknown category id readable instead of dropping it', () => {
      const ack = buildCaptureAck([captured({ category: 'not-a-real-category' })], { today: TODAY });

      expect(ack.summary).toBe('Такси · 18 000 сум · not-a-real-category');
    });
  });

  describe('multiple transactions', () => {
    it('counts the saved transactions and lists them one per line', () => {
      const ack = buildCaptureAck(
        [
          captured({ id: 'tx-1', description: 'кофе', amount: 35000, category: 'coffee' }),
          captured({ id: 'tx-2', description: 'продукты', amount: 132000, category: 'groceries' }),
        ],
        { today: TODAY }
      );

      expect(ack.title).toBe('Записал 2');
      expect(ack.summary).toBe('Кофе · 35 000 сум\nПродукты · 132 000 сум');
      expect(ack.actions).toEqual(['edit', 'delete']);
    });

    it('reports how many of the saved transactions need review', () => {
      const ack = buildCaptureAck(
        [
          captured({ id: 'tx-1', description: 'кофе', amount: 35000 }),
          captured({ id: 'tx-2', description: 'перевод', amount: 500000, needsReview: true }),
        ],
        { today: TODAY }
      );

      expect(ack.title).toBe('Записал 2 · 1 к проверке');
      expect(ack.actions).toEqual(['edit', 'delete', 'review']);
    });
  });

  describe('debts', () => {
    it('acknowledges a debt-only capture instead of claiming nothing was found', () => {
      const ack = buildCaptureAck([], { today: TODAY, debtsDetected: 1 });

      expect(ack.title).toBe('Записал долг');
      expect(ack.summary).toBe('Долгов записано: 1');
      expect(ack.actions).toEqual(['review']);
    });
  });

  describe('amount formatting', () => {
    it('groups thousands and keeps fractional amounts', () => {
      expect(buildCaptureAck([captured({ amount: 1500 })], { today: TODAY }).summary)
        .toBe('Такси · 1 500 сум · Транспорт');
      expect(buildCaptureAck([captured({ amount: 999 })], { today: TODAY }).summary)
        .toBe('Такси · 999 сум · Транспорт');
      expect(buildCaptureAck([captured({ amount: 1234.5 })], { today: TODAY }).summary)
        .toBe('Такси · 1 234,50 сум · Транспорт');
    });
  });
});
