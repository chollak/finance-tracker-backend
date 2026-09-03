import { describe, it, expect } from 'vitest';

import { toCaptureActionHint } from './toCaptureActionHint';
import { toCaptureFeedback } from './toCaptureFeedback';
import { CAPTURE_EXAMPLES } from './captureExamples';

// The ack's `actions` are hints only — this endpoint implements none of them
// (docs/QUICK_CAPTURE_API.md), so the card renders them as text pointing at the
// transaction list, never as buttons that would do nothing. The hint may only name
// that list when a transaction was actually written to it.
describe('toCaptureActionHint', () => {
  it('points at the list for a normal saved capture', () => {
    expect(toCaptureActionHint({ actions: ['edit', 'delete'], savedTransactionCount: 1 })).toBe(
      'Изменить или удалить — в списке операций ниже'
    );
  });

  it('prefers the review hint when something needs checking', () => {
    expect(
      toCaptureActionHint({ actions: ['edit', 'delete', 'review'], savedTransactionCount: 1 })
    ).toBe('Проверьте запись в списке операций ниже');
  });

  it('does not send a debt-only capture to the transaction list', () => {
    // `Записал долг` carries `review` but writes no transaction; the ack's own
    // "Проверьте в разделе долгов" details line is what points the user at the debt.
    expect(toCaptureActionHint({ actions: ['review'], savedTransactionCount: 0 })).toBeUndefined();
  });

  it('still points at the list when only one of edit/delete is offered', () => {
    expect(toCaptureActionHint({ actions: ['delete'], savedTransactionCount: 1 })).toBe(
      'Изменить или удалить — в списке операций ниже'
    );
  });

  it('says nothing when nothing was written', () => {
    expect(toCaptureActionHint({ actions: [], savedTransactionCount: 0 })).toBeUndefined();
  });

  it('accepts the feedback object as-is', () => {
    const feedback = toCaptureFeedback({
      status: 'needs_review',
      text: 'занял 200к у Алишера',
      source: 'miniapp',
      transactions: [],
      debts: [{ id: 'debt-1', debtType: 'i_owe', personName: 'Алишер', amount: 200000 }],
      ack: {
        title: 'Записал долг',
        summary: 'Долгов записано: 1',
        details: 'Проверьте в разделе долгов',
        actions: ['review'],
      },
      review: { reasons: ['debt_detected'] },
    });

    expect(toCaptureActionHint(feedback)).toBeUndefined();
  });
});

describe('CAPTURE_EXAMPLES', () => {
  it('offers short one-line phrasings that the capture text validator accepts', () => {
    expect(CAPTURE_EXAMPLES.length).toBeGreaterThan(0);

    for (const example of CAPTURE_EXAMPLES) {
      expect(example.trim()).toBe(example);
      expect(example).not.toContain('\n');
    }
  });
});
