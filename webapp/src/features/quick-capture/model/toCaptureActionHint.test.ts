import { describe, it, expect } from 'vitest';

import { toCaptureActionHint } from './toCaptureActionHint';
import { CAPTURE_EXAMPLES } from './captureExamples';

// The ack's `actions` are hints only — this endpoint implements none of them
// (docs/QUICK_CAPTURE_API.md), so the card renders them as text pointing at the
// transaction list, never as buttons that would do nothing.
describe('toCaptureActionHint', () => {
  it('points at the list for a normal saved capture', () => {
    expect(toCaptureActionHint(['edit', 'delete'])).toBe(
      'Изменить или удалить — в списке операций ниже'
    );
  });

  it('prefers the review hint when something needs checking', () => {
    expect(toCaptureActionHint(['edit', 'delete', 'review'])).toBe(
      'Проверьте запись в списке операций ниже'
    );
  });

  it('handles a debt-only capture, where review is the only action', () => {
    expect(toCaptureActionHint(['review'])).toBe('Проверьте запись в списке операций ниже');
  });

  it('still points at the list when only one of edit/delete is offered', () => {
    expect(toCaptureActionHint(['delete'])).toBe('Изменить или удалить — в списке операций ниже');
  });

  it('says nothing when nothing was written', () => {
    expect(toCaptureActionHint([])).toBeUndefined();
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
