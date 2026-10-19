import { detectPaymentHints, stripPaymentWords } from '../src/modules/voiceProcessing/domain/paymentHints';

describe('payment words (FT-103)', () => {
  it.each([
    ['кофе 25000 нал', { kind: 'cash' }],
    ['такси 18000 наличными', { kind: 'cash' }],
    ['обед 45000 налом', { kind: 'cash' }],
    ['продукты 186400 картой', { kind: 'card' }],
    ['продукты 186400 по карте', { kind: 'card' }],
    ['интернет 120000 uzcard', { kind: 'card' }],
    ['аптека 50000 humo', { kind: 'card' }],
    ['наушники 55$', { currency: 'USD' }],
    ['наушники 55 долларов', { currency: 'USD' }],
    ['подписка 9.99 usd картой', { currency: 'USD', kind: 'card' }],
    ['картошка 12000', {}],
    ['кофе 25000', {}],
    ['кофе 25к налом и такси 18к картой', { }],
  ])('%s → %j', (text, hints) => {
    expect(detectPaymentHints(text)).toEqual(hints);
  });

  it('removes payment words with their preposition', () => {
    expect(stripPaymentWords('такси 18000 наличными')).toBe('такси 18000');
    expect(stripPaymentWords('продукты 186400 по карте')).toBe('продукты 186400');
    expect(stripPaymentWords('наушники 55$')).toBe('наушники 55');
    expect(stripPaymentWords('наушники 55 долларов')).toBe('наушники 55');
    expect(stripPaymentWords('картошка 12000')).toBe('картошка 12000');
  });
});
