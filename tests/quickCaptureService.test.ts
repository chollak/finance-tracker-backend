import { QuickCaptureService } from '../src/modules/quickCapture/application/quickCaptureService';
import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { ProcessedTransaction } from '../src/modules/voiceProcessing/domain/processedTransaction';

function processTextInputReturning(processed: ProcessedTransaction) {
  return {
    execute: jest.fn().mockResolvedValue(processed),
  } as unknown as ProcessTextInputUseCase;
}

function processed(overrides: Partial<ProcessedTransaction> = {}): ProcessedTransaction {
  return { text: '', transactions: [], debts: [], ...overrides };
}

describe('QuickCaptureService', () => {
  describe('saved captures', () => {
    it('reports a simple expense as saved and marks it as a real expense', async () => {
      const useCase = processTextInputReturning(processed({
        text: 'такси 18к',
        transactions: [{
          id: 'tx-1',
          amount: 18000,
          category: 'transport',
          type: 'expense',
          semanticType: 'expense',
          needsReview: false,
          date: '2026-09-02',
          merchant: 'такси',
          description: 'такси',
          confidence: 1,
        }],
      }));

      const result = await new QuickCaptureService(useCase).capture({
        text: 'такси 18к',
        userId: 'user-1',
        userName: 'Shukur',
        source: 'miniapp',
      });

      expect(useCase.execute).toHaveBeenCalledWith('такси 18к', 'user-1', 'Shukur');
      expect(result.status).toBe('saved');
      expect(result.source).toBe('miniapp');
      expect(result.text).toBe('такси 18к');
      expect(result.transactions).toEqual([
        expect.objectContaining({
          id: 'tx-1',
          amount: 18000,
          type: 'expense',
          semanticType: 'expense',
          category: 'transport',
          needsReview: false,
          countsAsRealExpense: true,
        }),
      ]);
      expect(result.review.reasons).toEqual([]);
      expect(result.ack.title).toBe('Записал');
    });

    it('reports income as saved', async () => {
      const useCase = processTextInputReturning(processed({
        text: 'получил зарплату 12 млн',
        transactions: [{
          id: 'tx-income',
          amount: 12_000_000,
          category: 'salary',
          type: 'income',
          semanticType: 'income',
          needsReview: false,
          date: '2026-09-02',
          description: 'зарплата',
        }],
      }));

      const result = await new QuickCaptureService(useCase).capture({
        text: 'получил зарплату 12 млн',
        userId: 'user-1',
      });

      expect(result.status).toBe('saved');
      expect(result.transactions[0]).toEqual(expect.objectContaining({
        type: 'income',
        semanticType: 'income',
        countsAsRealExpense: false,
      }));
    });
  });

  describe('conservative semantic safeguards', () => {
    it('does not count an own transfer as a real expense', async () => {
      const useCase = processTextInputReturning(processed({
        text: 'перевел 500000 на Alif',
        transactions: [{
          id: 'tx-transfer',
          amount: 500000,
          category: 'transfer',
          type: 'expense',
          semanticType: 'own_transfer',
          needsReview: false,
          date: '2026-09-02',
          description: 'перевел на Alif',
        }],
      }));

      const result = await new QuickCaptureService(useCase).capture({
        text: 'перевел 500000 на Alif',
        userId: 'user-1',
      });

      expect(result.status).toBe('saved');
      expect(result.transactions[0].semanticType).toBe('own_transfer');
      expect(result.transactions[0].countsAsRealExpense).toBe(false);
    });

    it('does not count a savings deposit or a cash withdrawal as a real expense', async () => {
      for (const semanticType of ['saving_deposit', 'cash_withdrawal'] as const) {
        const useCase = processTextInputReturning(processed({
          transactions: [{
            id: `tx-${semanticType}`,
            amount: 300000,
            category: 'transfer',
            type: 'expense',
            semanticType,
            needsReview: false,
            date: '2026-09-02',
          }],
        }));

        const result = await new QuickCaptureService(useCase).capture({ text: 'снял 300000 наличными', userId: 'user-1' });

        expect(result.transactions[0].semanticType).toBe(semanticType);
        expect(result.transactions[0].countsAsRealExpense).toBe(false);
      }
    });

    it('normalizes a missing semantic type from the transaction type', async () => {
      const useCase = processTextInputReturning(processed({
        transactions: [{
          id: 'tx-bare',
          amount: 1000,
          category: 'other',
          type: 'income',
          date: '2026-09-02',
        }],
      }));

      const result = await new QuickCaptureService(useCase).capture({ text: 'что-то 1000', userId: 'user-1' });

      expect(result.transactions[0].semanticType).toBe('income');
      expect(result.transactions[0].needsReview).toBe(false);
    });
  });

  describe('needs review', () => {
    it('flags the capture when any parsed transaction needs review', async () => {
      const useCase = processTextInputReturning(processed({
        text: 'перевел 500к',
        transactions: [{
          id: 'tx-review',
          amount: 500000,
          category: 'other',
          type: 'expense',
          semanticType: 'expense',
          needsReview: true,
          date: '2026-09-02',
          description: 'перевел',
          confidence: 0.4,
        }],
      }));

      const result = await new QuickCaptureService(useCase).capture({ text: 'перевел 500к', userId: 'user-1' });

      expect(result.status).toBe('needs_review');
      expect(result.review.reasons).toContain('transaction_needs_review');
      expect(result.ack.title).toBe('Нужно проверить');
    });
  });

  describe('no transaction', () => {
    it('returns no_transaction when nothing was parsed', async () => {
      const useCase = processTextInputReturning(processed({ text: 'привет' }));

      const result = await new QuickCaptureService(useCase).capture({ text: 'привет', userId: 'user-1' });

      expect(result.status).toBe('no_transaction');
      expect(result.transactions).toEqual([]);
      expect(result.ack.actions).toEqual([]);
    });

    it('short-circuits blank text without touching the parser', async () => {
      const useCase = processTextInputReturning(processed());

      const result = await new QuickCaptureService(useCase).capture({ text: '   ', userId: 'user-1' });

      expect(useCase.execute).not.toHaveBeenCalled();
      expect(result.status).toBe('no_transaction');
      expect(result.text).toBe('');
    });
  });

  describe('multi-item input', () => {
    it('returns every parsed transaction', async () => {
      const useCase = processTextInputReturning(processed({
        text: 'кофе 35000 и продукты 132000',
        transactions: [
          { id: 'tx-1', amount: 35000, category: 'coffee', type: 'expense', semanticType: 'expense', needsReview: false, date: '2026-09-02', description: 'кофе' },
          { id: 'tx-2', amount: 132000, category: 'groceries', type: 'expense', semanticType: 'expense', needsReview: false, date: '2026-09-02', description: 'продукты' },
        ],
      }));

      const result = await new QuickCaptureService(useCase).capture({
        text: 'кофе 35000 и продукты 132000',
        userId: 'user-1',
      });

      expect(result.status).toBe('saved');
      expect(result.transactions.map(t => t.id)).toEqual(['tx-1', 'tx-2']);
      expect(result.ack.title).toBe('Записал 2');
    });
  });

  describe('debts', () => {
    it('does not claim nothing was captured when only a debt was created', async () => {
      const useCase = processTextInputReturning(processed({
        text: 'одолжил Бобу 200000',
        debts: [{ id: 'debt-1', debtType: 'owed_to_me', personName: 'Боб', amount: 200000 }],
      }));

      const result = await new QuickCaptureService(useCase).capture({ text: 'одолжил Бобу 200000', userId: 'user-1' });

      expect(result.status).toBe('needs_review');
      expect(result.review.reasons).toContain('debt_detected');
      expect(result.transactions).toEqual([]);
    });
  });

  describe('request handling', () => {
    it('trims the text before parsing and echoes the trimmed text back', async () => {
      const useCase = processTextInputReturning(processed({ text: 'кофе 35000' }));

      const result = await new QuickCaptureService(useCase).capture({ text: '  кофе 35000  ', userId: 'user-1' });

      expect(useCase.execute).toHaveBeenCalledWith('кофе 35000', 'user-1', undefined);
      expect(result.text).toBe('кофе 35000');
    });

    it('omits source when the caller did not send one', async () => {
      const useCase = processTextInputReturning(processed({ text: 'кофе 35000' }));

      const result = await new QuickCaptureService(useCase).capture({ text: 'кофе 35000', userId: 'user-1' });

      expect(result.source).toBeUndefined();
    });
  });
});
