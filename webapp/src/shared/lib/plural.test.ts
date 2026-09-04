import { describe, it, expect } from 'vitest';
import {
  pluralRu,
  pluralWithCount,
  pluralDays,
  pluralBudgets,
  pluralTransactions,
  pluralDebts,
  pluralActiveDebts,
  pluralCategories,
  pluralVoiceInputs,
} from './plural';

const forms = ['бюджет', 'бюджета', 'бюджетов'] as const;
const plural = (n: number) => pluralRu(n, ...forms);

describe('pluralRu', () => {
  it('picks the "one" form for numbers ending in 1 (except 11)', () => {
    expect(plural(1)).toBe('бюджет');
    expect(plural(21)).toBe('бюджет');
    expect(plural(101)).toBe('бюджет');
    expect(plural(131)).toBe('бюджет');
  });

  it('picks the "few" form for numbers ending in 2-4 (except 12-14)', () => {
    expect(plural(2)).toBe('бюджета');
    expect(plural(3)).toBe('бюджета');
    expect(plural(4)).toBe('бюджета');
    expect(plural(22)).toBe('бюджета');
    expect(plural(103)).toBe('бюджета');
  });

  it('picks the "many" form for 5-20 and zero', () => {
    expect(plural(0)).toBe('бюджетов');
    expect(plural(5)).toBe('бюджетов');
    expect(plural(10)).toBe('бюджетов');
    expect(plural(20)).toBe('бюджетов');
    expect(plural(100)).toBe('бюджетов');
  });

  it('applies the 11-14 exception', () => {
    expect(plural(11)).toBe('бюджетов');
    expect(plural(12)).toBe('бюджетов');
    expect(plural(13)).toBe('бюджетов');
    expect(plural(14)).toBe('бюджетов');
    expect(plural(111)).toBe('бюджетов');
    expect(plural(112)).toBe('бюджетов');
    expect(plural(114)).toBe('бюджетов');
    expect(plural(1011)).toBe('бюджетов');
  });

  it('covers the required reference set 1, 2, 5, 11, 21, 101', () => {
    expect([1, 2, 5, 11, 21, 101].map(plural)).toEqual([
      'бюджет',
      'бюджета',
      'бюджетов',
      'бюджетов',
      'бюджет',
      'бюджет',
    ]);
  });

  it('handles negative counts by magnitude', () => {
    expect(plural(-1)).toBe('бюджет');
    expect(plural(-3)).toBe('бюджета');
    expect(plural(-11)).toBe('бюджетов');
  });
});

describe('pluralWithCount', () => {
  it('prefixes the number', () => {
    expect(pluralWithCount(1, ...forms)).toBe('1 бюджет');
    expect(pluralWithCount(3, ...forms)).toBe('3 бюджета');
    expect(pluralWithCount(11, ...forms)).toBe('11 бюджетов');
  });
});

describe('domain helpers', () => {
  it.each([
    [pluralDays, ['день', 'дня', 'дней', 'дней', 'день', 'день']],
    [pluralBudgets, ['бюджет', 'бюджета', 'бюджетов', 'бюджетов', 'бюджет', 'бюджет']],
    [
      pluralTransactions,
      ['транзакция', 'транзакции', 'транзакций', 'транзакций', 'транзакция', 'транзакция'],
    ],
    [pluralDebts, ['долг', 'долга', 'долгов', 'долгов', 'долг', 'долг']],
    [
      pluralActiveDebts,
      [
        'активный долг',
        'активных долга',
        'активных долгов',
        'активных долгов',
        'активный долг',
        'активный долг',
      ],
    ],
    [
      pluralCategories,
      ['категория', 'категории', 'категорий', 'категорий', 'категория', 'категория'],
    ],
    [
      pluralVoiceInputs,
      [
        'голосовое сообщение',
        'голосовых сообщения',
        'голосовых сообщений',
        'голосовых сообщений',
        'голосовое сообщение',
        'голосовое сообщение',
      ],
    ],
  ])('agrees for 1, 2, 5, 11, 21, 101', (helper, expected) => {
    expect([1, 2, 5, 11, 21, 101].map((n) => helper(n))).toEqual(expected);
  });
});
