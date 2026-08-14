import { classifyByText } from '../src/modules/voiceProcessing/application/classifyByText';

/**
 * One classifier, used by the fast parser and by the historical backfill
 * preview. Two copies would drift, and the preview would then propose
 * something the parser would never produce.
 */
describe('classifyByText', () => {
  it.each([
    ['положил на вклад', 'saving_deposit'],
    ['вклад в банке', 'saving_deposit'],
    ['снял наличные', 'cash_withdrawal'],
    ['снял в банкомате', 'cash_withdrawal'],
    ['обналичил', 'cash_withdrawal'],
    ['перевел себе', 'own_transfer'],
    ['перевел на карту', 'own_transfer'],
    ['зарплата за июль', 'income'],
    ['аванс', 'income'],
  ])('«%s» → %s', (text, expected) => {
    expect(classifyByText(text)).toBe(expected);
  });

  it.each([
    'кофе и завтрак',
    'продукты на неделю',
    'яндекс такси',
    'кроссовки',
  ])('«%s» остаётся неопределённым', (text) => {
    expect(classifyByText(text)).toBeNull();
  });

  it('не выдумывает тип для пустого текста', () => {
    expect(classifyByText('')).toBeNull();
    expect(classifyByText('   ')).toBeNull();
  });
});
