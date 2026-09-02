import { describe, it, expect } from 'vitest';

import { toCaptureFeedback } from './toCaptureFeedback';
import { validateCaptureText, MAX_CAPTURE_TEXT_LENGTH } from './validateCaptureText';
import type { QuickCaptureResult } from './types';

// The Mini App must report exactly what POST /api/quick-capture did — everything in
// `transactions`/`debts` is already persisted, `no_transaction` wrote nothing, and the
// Russian wording comes from the server `ack` so Telegram and the Mini App confirm a
// capture with the same words (docs/QUICK_CAPTURE_API.md).
function result(overrides: Partial<QuickCaptureResult> = {}): QuickCaptureResult {
  return {
    status: 'saved',
    text: 'такси 18к',
    source: 'miniapp',
    transactions: [],
    debts: [],
    ack: { title: 'Записал', summary: 'Такси · 18 000 сум · Транспорт', actions: ['edit', 'delete'] },
    review: { reasons: [] },
    ...overrides,
  };
}

const savedTransaction: QuickCaptureResult['transactions'][number] = {
  id: 'tx-1',
  amount: 18000,
  type: 'expense',
  semanticType: 'expense',
  category: 'transport',
  description: 'такси',
  merchant: 'такси',
  date: '2026-09-02',
  confidence: 1,
  needsReview: false,
  countsAsRealExpense: true,
};

describe('toCaptureFeedback', () => {
  it('reports a saved capture with the server ack wording', () => {
    const feedback = toCaptureFeedback(result({ transactions: [savedTransaction] }));

    expect(feedback.tone).toBe('success');
    expect(feedback.title).toBe('Записал');
    expect(feedback.description).toBe('Такси · 18 000 сум · Транспорт');
    expect(feedback.savedTransactionCount).toBe(1);
    expect(feedback.savedDebtCount).toBe(0);
    expect(feedback.didPersist).toBe(true);
    expect(feedback.needsAttention).toBe(false);
    expect(feedback.reviewReasons).toEqual([]);
  });

  it('marks a needs_review capture as saved but requiring attention', () => {
    const feedback = toCaptureFeedback(
      result({
        status: 'needs_review',
        text: 'перевел 500к',
        transactions: [{ ...savedTransaction, id: 'tx-review', needsReview: true }],
        ack: {
          title: 'Нужно проверить',
          summary: 'Перевел · 500 000 сум',
          details: 'Сегодня · Не входит в расходы',
          actions: ['edit', 'delete', 'review'],
        },
        review: { reasons: ['transaction_needs_review'] },
      })
    );

    expect(feedback.tone).toBe('warning');
    expect(feedback.title).toBe('Нужно проверить');
    expect(feedback.didPersist).toBe(true);
    expect(feedback.needsAttention).toBe(true);
    expect(feedback.reviewReasons).toEqual(['transaction_needs_review']);
  });

  it('treats a debt-only capture as persisted even with no transactions', () => {
    const feedback = toCaptureFeedback(
      result({
        status: 'needs_review',
        text: 'занял 200к у Алишера',
        transactions: [],
        debts: [{ id: 'debt-1', debtType: 'i_owe', personName: 'Алишер', amount: 200000 }],
        ack: { title: 'Записал долг', summary: 'Алишер · 200 000 сум', actions: ['review'] },
        review: { reasons: ['debt_detected'] },
      })
    );

    expect(feedback.savedTransactionCount).toBe(0);
    expect(feedback.savedDebtCount).toBe(1);
    expect(feedback.didPersist).toBe(true);
    expect(feedback.needsAttention).toBe(true);
  });

  it('never claims a save when nothing was recognized', () => {
    const feedback = toCaptureFeedback(
      result({
        status: 'no_transaction',
        text: 'привет',
        ack: {
          title: 'Не нашёл операцию',
          summary: 'Не удалось распознать сумму или операцию',
          actions: [],
        },
      })
    );

    expect(feedback.tone).toBe('info');
    expect(feedback.didPersist).toBe(false);
    expect(feedback.savedTransactionCount).toBe(0);
    expect(feedback.savedDebtCount).toBe(0);
    expect(feedback.needsAttention).toBe(false);
  });

  it('counts every transaction of a multi-item capture', () => {
    const feedback = toCaptureFeedback(
      result({
        transactions: [savedTransaction, { ...savedTransaction, id: 'tx-2' }],
        ack: {
          title: 'Записал 2',
          summary: 'Такси · 18 000 сум\nКофе · 35 000 сум',
          actions: ['edit', 'delete'],
        },
      })
    );

    expect(feedback.savedTransactionCount).toBe(2);
    expect(feedback.description).toBe('Такси · 18 000 сум\nКофе · 35 000 сум');
  });
});

describe('validateCaptureText', () => {
  it('trims the text the way the server echoes it back', () => {
    expect(validateCaptureText('  такси 18к  ')).toEqual({ ok: true, text: 'такси 18к' });
  });

  it('rejects blank input before checking length', () => {
    expect(validateCaptureText('')).toEqual({ ok: false, reason: 'empty' });
    expect(validateCaptureText('   \n ')).toEqual({ ok: false, reason: 'empty' });
    // Whitespace-only text over the limit is still "empty" — same order as the route handler.
    expect(validateCaptureText(' '.repeat(MAX_CAPTURE_TEXT_LENGTH + 1))).toEqual({
      ok: false,
      reason: 'empty',
    });
  });

  it('measures length on the raw string, before trimming', () => {
    expect(validateCaptureText('a'.repeat(MAX_CAPTURE_TEXT_LENGTH))).toEqual({
      ok: true,
      text: 'a'.repeat(MAX_CAPTURE_TEXT_LENGTH),
    });
    // 2000 non-space chars padded to 2002 raw characters: the server rejects this.
    expect(validateCaptureText(` ${'a'.repeat(MAX_CAPTURE_TEXT_LENGTH)} `)).toEqual({
      ok: false,
      reason: 'too_long',
    });
  });
});
