import {
  StoredTransactionRow,
  backfillSearchText,
  isBackfillCandidate,
  suggestSemanticType,
} from '../src/modules/transaction/domain/semanticBackfillSuggestion';
import { previewSemanticBackfill } from '../src/modules/transaction/application/previewSemanticBackfill';

function row(overrides: Partial<StoredTransactionRow> = {}): StoredTransactionRow {
  return {
    id: 'row-1',
    date: '2026-01-15',
    amount: 100000,
    type: 'expense',
    semanticType: 'expense',
    needsReview: false,
    category: 'other',
    description: 'Покупка',
    isArchived: false,
    isDebtRelated: false,
    ...overrides,
  };
}

describe('isBackfillCandidate', () => {
  it('accepts rows stuck on the legacy expense default', () => {
    expect(isBackfillCandidate(row({ semanticType: 'expense' }))).toBe(true);
  });

  it('accepts rows with no semantic type at all', () => {
    expect(isBackfillCandidate(row({ semanticType: null }))).toBe(true);
    expect(isBackfillCandidate(row({ semanticType: undefined }))).toBe(true);
    expect(isBackfillCandidate(row({ semanticType: '  ' }))).toBe(true);
  });

  it('leaves rows that already carry a real semantic type alone', () => {
    expect(isBackfillCandidate(row({ semanticType: 'own_transfer' }))).toBe(false);
    expect(isBackfillCandidate(row({ semanticType: 'income' }))).toBe(false);
    expect(isBackfillCandidate(row({ semanticType: 'debt' }))).toBe(false);
  });
});

describe('backfillSearchText', () => {
  it('searches the original phrase and the description together', () => {
    const text = backfillSearchText(row({ originalText: 'перевел себе 500000', description: 'Перевод' }));
    expect(text).toBe('перевел себе 500000 Перевод');
  });

  it('does not duplicate identical original text and description', () => {
    expect(backfillSearchText(row({ originalText: 'такси', description: 'такси' }))).toBe('такси');
  });

  it('falls back to whichever field is present', () => {
    expect(backfillSearchText(row({ originalText: null, description: 'обед' }))).toBe('обед');
    expect(backfillSearchText(row({ originalText: 'обед', description: null }))).toBe('обед');
    expect(backfillSearchText(row({ originalText: null, description: null }))).toBe('');
  });

  it('ignores the merchant, whose name can fake a keyword match', () => {
    // "Click" is an own-account target keyword — as a merchant name it means nothing.
    expect(backfillSearchText(row({ originalText: null, description: 'Оплата', merchant: 'Click' })))
      .toBe('Оплата');
  });
});

describe('suggestSemanticType — confident rules', () => {
  it('marks a debt-linked row as debt regardless of wording', () => {
    const suggestion = suggestSemanticType(row({ description: 'Ужин', isDebtRelated: true }));
    expect(suggestion).toMatchObject({ rule: 'debt_linked_row', suggestedType: 'debt', needsReview: false });
  });

  it('treats a relatedDebtId as the same signal', () => {
    const suggestion = suggestSemanticType(row({ isDebtRelated: null, relatedDebtId: 'debt-7' }));
    expect(suggestion.suggestedType).toBe('debt');
  });

  it('recognizes debt wording', () => {
    for (const text of ['одолжил другу 200000', 'вернул долг', 'qarz oldim', 'lent 50 to Ali']) {
      expect(suggestSemanticType(row({ originalText: text })).suggestedType).toBe('debt');
    }
  });

  it('recognizes savings wording', () => {
    const suggestion = suggestSemanticType(row({ originalText: 'положил на вклад 1000000' }));
    expect(suggestion).toMatchObject({ rule: 'saving_deposit_keywords', suggestedType: 'saving_deposit', needsReview: false });
  });

  it('recognizes a withdrawal that names where the cash came from', () => {
    const suggestion = suggestSemanticType(row({ originalText: 'снял в банкомате 300000' }));
    expect(suggestion).toMatchObject({ rule: 'obvious_cash_withdrawal', suggestedType: 'cash_withdrawal', needsReview: false });
  });

  it('recognizes a transfer that names an own account', () => {
    const suggestion = suggestSemanticType(row({ originalText: 'перевел себе на карту 500000' }));
    expect(suggestion).toMatchObject({ rule: 'obvious_own_transfer', suggestedType: 'own_transfer', needsReview: false });
  });

  it('fixes a legacy income row that kept the expense default', () => {
    const suggestion = suggestSemanticType(row({ type: 'income', description: 'Оплата за проект' }));
    expect(suggestion).toMatchObject({ rule: 'legacy_income_row', suggestedType: 'income', needsReview: false });
  });
});

describe('suggestSemanticType — uncertain rules become needsReview candidates', () => {
  it('flags a bare withdrawal verb instead of deciding it', () => {
    // "снял квартиру" is rent, not a withdrawal — the type is plausible, not established.
    const suggestion = suggestSemanticType(row({ originalText: 'снял 300000' }));
    expect(suggestion).toMatchObject({ rule: 'ambiguous_cash_withdrawal', suggestedType: 'cash_withdrawal', needsReview: true });
  });

  it('flags a transfer with no own-account target', () => {
    const suggestion = suggestSemanticType(row({ originalText: 'перевел маме 200000' }));
    expect(suggestion).toMatchObject({ rule: 'ambiguous_transfer', suggestedType: 'own_transfer', needsReview: true });
  });

  it('flags money coming back as a reimbursement question', () => {
    const suggestion = suggestSemanticType(row({ originalText: 'вернули за билет 150000' }));
    expect(suggestion).toMatchObject({ rule: 'repayment_keywords', suggestedType: 'reimbursement', needsReview: true });
  });

  it('flags a group payment, since the wording never says whether money came back', () => {
    const suggestion = suggestSemanticType(row({ originalText: 'заплатил за всех, потом скинулись поровну' }));
    expect(suggestion).toMatchObject({ rule: 'group_payment_keywords', suggestedType: 'group_payment', needsReview: true });
  });

  it('flags salary wording on an expense row rather than flipping it to income', () => {
    const suggestion = suggestSemanticType(row({ originalText: 'выдал зарплату помощнику' }));
    expect(suggestion).toMatchObject({ rule: 'income_keywords', suggestedType: 'income', needsReview: true });
  });
});

describe('suggestSemanticType — rows it deliberately leaves alone', () => {
  it('returns no suggestion for ordinary spending', () => {
    const suggestion = suggestSemanticType(row({ originalText: 'кофе 25000' }));
    expect(suggestion).toMatchObject({ rule: 'no_match', suggestedType: null, needsReview: false });
  });

  it('returns no suggestion when there is no text to read', () => {
    const suggestion = suggestSemanticType(row({ description: null, originalText: null }));
    expect(suggestion.suggestedType).toBeNull();
  });

  it('does not fire on wording that merely contains a keyword as a fragment', () => {
    // "вернулся домой" must not read as a repayment; "нальют" must not read as cash.
    expect(suggestSemanticType(row({ originalText: 'вернулся домой на такси' })).suggestedType).toBeNull();
    expect(suggestSemanticType(row({ originalText: 'нальют кофе за 20000' })).suggestedType).toBeNull();
  });

  it('prefers the debt link over wording when both are present', () => {
    const suggestion = suggestSemanticType(row({ originalText: 'перевел себе на карту', isDebtRelated: true }));
    expect(suggestion.rule).toBe('debt_linked_row');
  });
});

describe('previewSemanticBackfill', () => {
  const rows: StoredTransactionRow[] = [
    row({ id: 'a', originalText: 'перевел себе на карту 500000' }),
    row({ id: 'b', originalText: 'снял в банкомате 300000' }),
    row({ id: 'c', originalText: 'снял 300000' }),
    row({ id: 'd', originalText: 'вернули за билет', isArchived: true }),
    row({ id: 'e', originalText: 'кофе 25000' }),
    row({ id: 'f', type: 'income', originalText: 'зарплата' }),
    row({ id: 'g', semanticType: 'own_transfer', originalText: 'перевел себе' }),
  ];

  it('counts candidates, confident guesses, disputed cases and untouched rows', () => {
    const preview = previewSemanticBackfill(rows);

    expect(preview.totals).toEqual({
      scanned: 7,
      alreadyTyped: 1,
      candidates: 6,
      archivedCandidates: 1,
      confident: 3,
      needsReview: 2,
      unmatched: 1,
    });
  });

  it('never reports a row that already has a semantic type', () => {
    const preview = previewSemanticBackfill(rows);
    expect(preview.rows.map(previewed => previewed.id)).not.toContain('g');
  });

  it('counts candidates per suggested semantic type', () => {
    const preview = previewSemanticBackfill(rows);
    expect(preview.bySuggestedType).toEqual({
      own_transfer: 1,
      cash_withdrawal: 2,
      reimbursement: 1,
      income: 1,
    });
  });

  it('groups rows by rule, most frequent first', () => {
    const preview = previewSemanticBackfill(rows);
    const counts = Object.fromEntries(preview.byRule.map(group => [group.rule, group.count]));

    expect(counts).toEqual({
      obvious_own_transfer: 1,
      obvious_cash_withdrawal: 1,
      ambiguous_cash_withdrawal: 1,
      repayment_keywords: 1,
      no_match: 1,
      legacy_income_row: 1,
    });
    const sorted = [...preview.byRule].sort((a, b) => b.count - a.count);
    expect(preview.byRule.map(group => group.count)).toEqual(sorted.map(group => group.count));
  });

  it('lists exactly the uncertain rows as disputed', () => {
    const preview = previewSemanticBackfill(rows);
    expect(preview.disputed.map(previewed => previewed.id)).toEqual(['c', 'd']);
  });

  it('respects the example and disputed limits', () => {
    const many = Array.from({ length: 8 }, (_, index) => row({ id: `t${index}`, originalText: 'снял 100000' }));
    const preview = previewSemanticBackfill(many, { examplesPerRule: 2, disputedLimit: 3 });

    expect(preview.byRule[0].count).toBe(8);
    expect(preview.byRule[0].examples).toHaveLength(2);
    expect(preview.disputed).toHaveLength(3);
    expect(preview.totals.needsReview).toBe(8);
  });

  it('reads SQLite 0/1 flags as booleans', () => {
    const preview = previewSemanticBackfill([
      { id: 'sqlite', type: 'expense', semanticType: 'expense', description: 'Ужин', isArchived: 1, isDebtRelated: 1, needsReview: 1 },
    ]);

    expect(preview.totals.archivedCandidates).toBe(1);
    expect(preview.rows[0].storedNeedsReview).toBe(true);
    expect(preview.rows[0].suggestion.suggestedType).toBe('debt');
  });

  it('handles an empty database without inventing anything', () => {
    const preview = previewSemanticBackfill([]);
    expect(preview.totals.scanned).toBe(0);
    expect(preview.byRule).toEqual([]);
    expect(preview.disputed).toEqual([]);
  });
});
