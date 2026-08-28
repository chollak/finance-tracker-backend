import { describe, it, expect } from 'vitest';
import { formatAmount, heroFontSize } from './money';

const NBSP = '\u00A0';

describe('форматирование суммы', () => {
  it('разделяет разряды неразрывным пробелом', () => {
    // Обычный пробел позволил бы перенос: «54» на одной строке, «124 654» на другой.
    expect(formatAmount(54124654)).toBe(`54${NBSP}124${NBSP}654`);
  });

  it('в результате нет обычных пробелов', () => {
    expect(formatAmount(1000000)).not.toMatch(/ /);
  });

  it('без дробной части: у сума копеек на практике нет', () => {
    expect(formatAmount(45000.4)).toBe(`45${NBSP}000`);
    expect(formatAmount(45000.5)).toBe(`45${NBSP}001`);
  });

  it('ноль остаётся нулём, а не пустой строкой', () => {
    expect(formatAmount(0)).toBe('0');
  });
});

describe('размер герой-цифры', () => {
  it('выбирается по числу знаков, а не подгоняется на глаз', () => {
    expect(heroFontSize(57000)).toBe(52);
    expect(heroFontSize(2582000)).toBe(46);
    expect(heroFontSize(54124654)).toBe(40);
  });

  it('не опускается ниже 40: иначе цифра перестаёт быть доминантой', () => {
    expect(heroFontSize(999999999999)).toBe(40);
  });

  it('ноль показывается крупно', () => {
    expect(heroFontSize(0)).toBe(52);
  });
});
