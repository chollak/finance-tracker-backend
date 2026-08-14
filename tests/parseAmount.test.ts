import { parseAmount } from '../src/modules/voiceProcessing/application/parseAmount';

/**
 * The fast path may not silently drop anything attached to the number.
 * It either understands the token or declines, so the phrase goes to the model
 * instead of being stored with a lost order of magnitude.
 */
describe('parseAmount', () => {
  describe('понимает множители', () => {
    it.each([
      ['зарплата 12 млн', 12_000_000, 'зарплата'],
      ['зарплата 12 миллионов', 12_000_000, 'зарплата'],
      ['аренда 3.5 млн', 3_500_000, 'аренда'],
      ['премия 2 млн сум', 2_000_000, 'премия'],
      ['кофе 25 тыс', 25_000, 'кофе'],
      ['кофе 25 тысяч', 25_000, 'кофе'],
      ['обед 50 тыщ', 50_000, 'обед'],
      ['такси 15к', 15_000, 'такси'],
      ['подарок 1 млрд', 1_000_000_000, 'подарок'],
    ])('%s → %d', (text, amount, remainder) => {
      const parsed = parseAmount(text);
      expect(parsed).not.toBeNull();
      expect(parsed!.amount).toBe(amount);
      expect(parsed!.remainder).toBe(remainder);
    });
  });

  describe('разбирает суммы без множителя как раньше', () => {
    it.each([
      ['кофе 25000', 25_000, 'кофе'],
      ['кофе 25000 сум', 25_000, 'кофе'],
      ['продукты 150 000', 150_000, 'продукты'],
      ['такси 15 000 uzs', 15_000, 'такси'],
    ])('%s → %d', (text, amount, remainder) => {
      const parsed = parseAmount(text);
      expect(parsed).not.toBeNull();
      expect(parsed!.amount).toBe(amount);
      expect(parsed!.remainder).toBe(remainder);
    });
  });

  describe('отказывается, когда не понимает', () => {
    it('незнакомый токен сразу после числа', () => {
      // Может оказаться множителем, единицей или чем угодно — гадать нельзя.
      expect(parseAmount('бензин 40 литров')).toBeNull();
      expect(parseAmount('ткань 5 метров')).toBeNull();
    });

    it('чисел больше одного', () => {
      expect(parseAmount('кофе 2 по 25000')).toBeNull();
    });

    it('чисел нет вовсе', () => {
      expect(parseAmount('просто текст')).toBeNull();
    });

    it('ноль и отрицательные суммы', () => {
      expect(parseAmount('кофе 0')).toBeNull();
      expect(parseAmount('кофе -500')).toBeNull();
    });

    it('множитель без числа', () => {
      expect(parseAmount('зарплата млн')).toBeNull();
    });
  });

  describe('множитель не остаётся в описании', () => {
    it('«млн» не превращается в часть названия', () => {
      const parsed = parseAmount('зарплата 12 млн');
      expect(parsed!.remainder).not.toContain('млн');
    });

    it('слово валюты тоже убирается', () => {
      const parsed = parseAmount('кофе 25000 сум');
      expect(parsed!.remainder).not.toContain('сум');
    });
  });
});

describe('число в середине фразы', () => {
  it.each([
    ['перевел 500000 на Alif', 500_000, 'перевел на Alif'],
    ['положил 1000000 в банк', 1_000_000, 'положил в банк'],
    ['отдал 200000 за аренду', 200_000, 'отдал за аренду'],
  ])('%s → %d', (text, amount, remainder) => {
    const parsed = parseAmount(text);
    expect(parsed).not.toBeNull();
    expect(parsed!.amount).toBe(amount);
    expect(parsed!.remainder).toBe(remainder);
  });

  it('множитель в середине фразы тоже применяется', () => {
    const parsed = parseAmount('перевел 3 млн на карту');
    expect(parsed!.amount).toBe(3_000_000);
    expect(parsed!.remainder).toBe('перевел на карту');
  });
});
