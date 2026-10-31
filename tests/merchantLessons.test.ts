import { merchantCategories, withLesson, withoutLessonsOf } from '../src/shared/application/learning/categoryLessonStore';
import { LearnedPatterns, LearningData, MerchantPattern } from '../src/shared/application/learning/learningTypes';
import { CategoryLesson } from '../src/modules/transaction/domain/categoryLessons';

/**
 * FT-208 review: a merchant key no longer has its legal form, so «korzinka» and «ytt korzinka», taught apart by payment
 * corrections before, are one merchant now. Neither may keep a category the latest correction changed.
 */
const payment = (name: string, category: string, extra: Partial<MerchantPattern> = {}): MerchantPattern =>
  ({ aliases: [name], normalizedName: name, category, usageCount: 1, fromPayments: true, ...extra });

const patternsOf = (merchants: MerchantPattern[]): LearnedPatterns => ({ categories: [], merchants, words: [] });

const lesson = (recordId: string, merchant: string, presetKey: string): CategoryLesson =>
  ({ kind: 'merchant', merchant, presetKey, recordId, userId: 'user-1', originalParsing: { amount: 25000, category: 'Покупки', type: 'expense' } }) as CategoryLesson;

const historyOf = (recordId: string, merchant: string, category: string): LearningData => ({
  originalText: merchant,
  originalParsing: { amount: 25000, category: 'Покупки', type: 'expense' },
  userCorrection: { category },
  userId: 'user-1',
  timestamp: '2026-10-30T10:00:00Z',
  confidence: 0.8,
  recordId,
  merchant,
});

describe('a merchant taught with and without its legal form (FT-208)', () => {
  it('until it is corrected again, the alias spelled as its key wins, wherever it stands', () => {
    expect(merchantCategories([payment('korzinka', 'shopping'), payment('ytt korzinka', 'groceries')]).get('korzinka')).toBe('shopping');
    expect(merchantCategories([payment('ytt korzinka', 'groceries'), payment('korzinka', 'shopping')]).get('korzinka')).toBe('shopping');
  });

  it('a correction makes them one pattern with every alias, in the new category', () => {
    const corrected = withLesson(patternsOf([payment('korzinka', 'shopping'), payment('ytt korzinka', 'groceries')]), lesson('r-3', 'korzinka', 'transport'));

    expect(corrected.merchants).toEqual([
      { aliases: ['korzinka', 'ytt korzinka'], normalizedName: 'korzinka', category: 'transport', usageCount: 1, fromPayments: true },
    ]);
    expect(merchantCategories(corrected.merchants).get('korzinka')).toBe('transport');
  });

  it('counts on from the pattern already in the corrected category', () => {
    const corrected = withLesson(patternsOf([payment('korzinka', 'shopping'), payment('ytt korzinka', 'groceries', { usageCount: 2 })]), lesson('r-3', 'korzinka', 'groceries'));

    expect(corrected.merchants).toEqual([expect.objectContaining({ category: 'groceries', usageCount: 3 })]);
  });

  it('leaves a merchant of the seed or of the learning before FT-184 as it is', () => {
    const seed: MerchantPattern = { aliases: ['korzinka market'], normalizedName: 'Korzinka', category: 'groceries', usageCount: 3 };

    const corrected = withLesson(patternsOf([seed]), lesson('r-3', 'korzinka', 'transport'));

    expect(corrected.merchants).toEqual([seed, payment('korzinka', 'transport')]);
  });

  it('taking a correction back leaves the merchant as the lessons of both spellings in the history make it', () => {
    const history = [historyOf('r-1', 'ytt korzinka', 'groceries'), historyOf('r-2', 'korzinka', 'transport')];
    const merged = patternsOf([{ ...payment('korzinka', 'transport'), aliases: ['ytt korzinka', 'korzinka'] }]);

    const { patterns, taken } = withoutLessonsOf('r-2', merged, history);

    expect(taken).toBe(1);
    expect(patterns.merchants).toEqual([payment('korzinka', 'groceries')]);
  });
});
