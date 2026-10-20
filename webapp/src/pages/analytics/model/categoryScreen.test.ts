import { describe, expect, it } from 'vitest';
import type { CategoryAnalytics } from '@/entities/analytics';
import { CAFE, CAFE_RECORDS, cafeRecord, daysOf, OCTOBER_INCOME } from './fixtures';
import {
  categoryInsight,
  categoryPeriodLabel,
  categorySummary,
  dayChart,
  dayChip,
  noOperationsText,
  stepDay,
  tapDay,
} from './categoryScreen';

/**
 * FT-121, boards «Аналитика · категория «Кафе»» and DayBars.md: one category of the month — its sum, share, count,
 * average and comparison; the insight about the category built from its operations; spending by day as bars with a
 * chosen day; and the words of the list of operations.
 */

const plain = (value: string | null | undefined) => value?.replace(/\u00a0/g, ' ') ?? null;
const som = (value: number) => value * 100;

describe('the category’s total (board «Аналитика · категория «Кафе»»)', () => {
  const summary = categorySummary(CAFE);

  it('the sum, its share of the month, how many operations and the average', () => {
    expect(plain(summary.amount)).toBe('1 092 000');
    expect(summary.tone).toBe('ink');
    expect(plain(summary.meta)).toBe('14% расходов · 10 операций · в среднем 109 200 сум');
  });

  it('compared with the same days of the previous month', () => {
    expect(plain(summary.compare)).toBe('↑ 40% к 1–14 сентября · на 312 000 сум больше');
  });

  it('the header names the days counted', () => {
    expect(plain(categoryPeriodLabel(CAFE))).toBe('1–14 октября');
    expect(plain(categoryPeriodLabel({ ...CAFE, month: '2026-09', period: { month: '2026-09', from: '2026-09-01', to: '2026-09-30', wholeMonth: true } }))).toBe('сентябрь');
  });

  it('one operation has no average', () => {
    const one = categorySummary({ ...CAFE, count: 1, sharePercent: 3, amountMinor: som(25_000), records: [CAFE_RECORDS[1]] });
    expect(plain(one.meta)).toBe('3% расходов · 1 операция');
  });

  it('other comparisons: the same, none before, nothing to compare with', () => {
    expect(plain(categorySummary({ ...CAFE, change: { kind: 'same', percent: 0, diffMinor: 0 } }).compare)).toBe('Столько же, как за 1–14 сентября');
    expect(plain(categorySummary({ ...CAFE, previousMinor: 0, change: { kind: 'new', percent: null, diffMinor: som(1_092_000) } }).compare)).toBe('В те же дни сентября не было');
    expect(plain(categorySummary({ ...CAFE, change: { kind: 'down', percent: 15, diffMinor: som(-90_000) } }).compare)).toBe('↓ 15% к 1–14 сентября · на 90 000 сум меньше');
    expect(categorySummary({ ...CAFE, comparable: false, previous: null, previousMinor: null, change: null }).compare).toBeNull();
  });

  it('income: green, «доходов», and a month not yet over is set against the whole previous one', () => {
    const salary: CategoryAnalytics = {
      ...CAFE,
      previous: OCTOBER_INCOME.previous,
      category: { id: 'zp', name: 'Зарплата', type: 'income' },
      amountMinor: som(7_500_000),
      count: 1,
      sharePercent: 100,
      previousMinor: som(12_500_000),
      change: { kind: 'so_far', percent: 60, diffMinor: som(-5_000_000) },
      records: [cafeRecord('z1', 13, 7_500_000, 'Аванс', 'card', { type: 'income', categoryId: 'zp' })],
    };
    const summary = categorySummary(salary);
    expect(summary.tone).toBe('income');
    expect(plain(summary.meta)).toBe('100% доходов · 1 операция');
    expect(plain(summary.compare)).toBe('За весь сентябрь — 12 500 000 сум');
  });

  it('converted dollars are marked «≈»', () => {
    expect(plain(categorySummary({ ...CAFE, hasUsd: true }).amount)).toBe('≈ 1 092 000');
  });
});

describe('the insight about the category, from its operations', () => {
  it('two operations make more than half: names both (board «Кафе»)', () => {
    expect(categoryInsight(CAFE)).toBe('Больше половины — «Семейный ужин» и «Ужин с друзьями»');
  });

  it('almost half, and two operations with one note', () => {
    const records = [
      cafeRecord('a', 5, 230_000, 'Ужин', 'card'),
      cafeRecord('b', 4, 230_000, 'Ужин', 'card'),
      cafeRecord('c', 3, 300_000, 'Кофе', 'card'),
      cafeRecord('d', 2, 260_000, 'Обед', 'card'),
    ];
    // The two largest: 300 000 + 260 000 of 1 020 000 — 55%
    expect(categoryInsight({ ...CAFE, records })).toBe('Больше половины — «Кофе» и «Обед»');
    const almost = [...records, cafeRecord('e', 1, 220_000, 'Пицца', 'card')];
    // 560 000 of 1 240 000 — 45%
    expect(categoryInsight({ ...CAFE, records: almost })).toBe('Почти половина — «Кофе» и «Обед»');
    const twice = [cafeRecord('a', 5, 400_000, 'Ужин', 'card'), cafeRecord('b', 4, 400_000, 'ужин ', 'card'), cafeRecord('c', 3, 100_000, 'Кофе', 'card')];
    expect(categoryInsight({ ...CAFE, records: twice })).toBe('Больше половины — две траты «Ужин»');
  });

  it('many small ones: the most frequent note', () => {
    const records = [
      ...Array.from({ length: 5 }, (_, index) => cafeRecord(`k${index}`, index + 1, 25_000, 'Кофе', 'cash')),
      cafeRecord('o1', 8, 60_000, 'Обед', 'card'),
      cafeRecord('o2', 9, 62_000, 'Обед', 'card'),
      cafeRecord('p', 10, 58_000, 'Пицца', 'card'),
      cafeRecord('s', 11, 61_000, 'Суши', 'card'),
    ];
    expect(categoryInsight({ ...CAFE, records })).toBe('Чаще всего — «Кофе»: 5 раз');
  });

  it('otherwise the largest one, in its own currency', () => {
    const records = [
      cafeRecord('a', 6, 50_000, 'Ужин', 'card'),
      cafeRecord('b', 5, 48_000, 'Обед', 'card'),
      cafeRecord('c', 4, 47_000, 'Кофе', 'card'),
      cafeRecord('d', 3, 46_000, 'Пицца', 'card'),
      cafeRecord('e', 2, 45_000, 'Суши', 'card'),
      cafeRecord('f', 1, 44_000, 'Плов', 'card'),
    ];
    // The two largest are 35% of 280 000, no note repeats
    expect(plain(categoryInsight({ ...CAFE, records }))).toBe('Крупнейшая — «Ужин»: 50 000 сум');
    // 4 USD at 12 650 is 50 600 сум: the largest, told in dollars
    const dollars = [cafeRecord('u', 6, 0, 'Ужин', 'card', { currency: 'USD', amountMinor: 400 }), ...records.slice(1)];
    expect(plain(categoryInsight({ ...CAFE, usd: { present: true, missingRate: false, rateMinor: 1_265_000, source: 'cbu' }, records: dollars }))).toBe(
      'Крупнейшая — «Ужин»: 4,00 USD'
    );
    const noNote = [cafeRecord('a', 5, 90_000, '', 'card'), cafeRecord('b', 4, 10_000, 'Кофе', 'card')];
    expect(plain(categoryInsight({ ...CAFE, records: noNote }))).toBe('Крупнейшая — 90 000 сум, 5 октября');
  });

  it('dollars count at the rate of the answer', () => {
    const records = [
      cafeRecord('u', 6, 0, 'Ужин в Ташкент-Сити', 'card', { currency: 'USD', amountMinor: 30_000 }),
      cafeRecord('a', 5, 50_000, 'Кофе', 'card'),
      cafeRecord('b', 4, 50_000, 'Обед', 'card'),
    ];
    const usd = { present: true, missingRate: false, rateMinor: 1_265_000, source: 'cbu' as const };
    // 300 USD = 3 795 000 сум: the largest by far
    expect(categoryInsight({ ...CAFE, usd, records })).toBe('Больше половины — «Ужин в Ташкент-Сити» и «Кофе»');
  });

  it('one operation; none; the first days of recording', () => {
    expect(categoryInsight({ ...CAFE, records: [CAFE_RECORDS[6]] })).toBe('Одна операция — 5 октября');
    expect(categoryInsight({ ...CAFE, records: [] })).toBeNull();
    expect(categoryInsight({ ...CAFE, firstDays: { days: 3, daysLeft: 4 } })).toBe('Выводы появятся через неделю записей');
  });
});

describe('spending by day (DayBars.md)', () => {
  const chart = dayChart(CAFE, null)!;

  it('the current month shows its days up to today, 14px bars, the tallest 100px', () => {
    expect(chart.columns).toHaveLength(14);
    expect(chart.narrow).toBe(false);
    const fifth = chart.columns[4];
    expect([fifth.date, fifth.heightPx]).toEqual(['2026-10-05', 100]);
    // 286 000 of 318 000
    expect(chart.columns[8].heightPx).toBe(90);
    // A day without operations has no bar
    expect(chart.columns[3].heightPx).toBe(0);
  });

  it('a non-zero day is at least 3px tall', () => {
    const tiny = dayChart({ ...CAFE, days: CAFE.days.map((day) => (day.date === '2026-10-02' ? { ...day, amountMinor: 100 } : day)) }, null)!;
    expect(tiny.columns[1].heightPx).toBe(3);
  });

  it('the axis: the 1st, every 7th day and the last one', () => {
    expect(chart.columns.map((column) => column.label).filter(Boolean)).toEqual(['1', '7', '14']);
  });

  it('a whole month: 6px bars, labels on the 1st, 8th, 15th, 22nd and the last day', () => {
    const september: CategoryAnalytics = {
      ...CAFE,
      month: '2026-09',
      period: { month: '2026-09', from: '2026-09-01', to: '2026-09-30', wholeMonth: true },
      days: daysOf('2026-09', 30, [cafeRecord('s', 5, 1000, 'Кофе', 'cash', { date: '2026-09-05' })]),
    };
    const whole = dayChart(september, null)!;
    expect(whole.columns).toHaveLength(30);
    expect(whole.narrow).toBe(true);
    expect(whole.columns.map((column) => column.label).filter(Boolean)).toEqual(['1', '8', '15', '22', '30']);
  });

  it('a record dated later this month extends the days shown up to it', () => {
    const later = [...CAFE_RECORDS, cafeRecord('f', 20, 40_000, 'Бронь столика', 'card')];
    expect(dayChart({ ...CAFE, days: daysOf('2026-10', 31, later) }, null)!.columns).toHaveLength(20);
  });

  it('without a chosen day the readout asks to choose; the chart says its largest day', () => {
    expect(chart.readout).toEqual({ top: 'Коснитесь столбца или выберите день стрелками', value: null });
    expect(plain(chart.ariaLabel)).toBe('Траты по дням, 1–14 октября. Больше всего — 5 октября: 318 000 сум. Выбрать день');
    expect(chart.columns.some((column) => column.selected || column.dim)).toBe(false);
  });

  it('a chosen day is lit, the others dimmed, its neighbours’ labels hidden', () => {
    const chosen = dayChart(CAFE, '2026-10-05')!;
    expect(plain(chosen.readout.top)).toBe('5 октября');
    expect(plain(chosen.readout.value)).toBe('318 000 сум · 1 операция');
    expect(chosen.columns[4]).toMatchObject({ selected: true, dim: false, label: '5' });
    expect(chosen.columns[0]).toMatchObject({ selected: false, dim: true, label: '1' });
    // ±2 days: the 7th loses its label
    expect(chosen.columns.map((column) => column.label).filter(Boolean)).toEqual(['1', '5', '14']);
    expect(dayChart(CAFE, '2026-10-04')!.readout.value).toBe('нет операций');
    expect(chosen.atFirst).toBe(false);
    expect(dayChart(CAFE, '2026-10-01')!.atFirst).toBe(true);
    expect(dayChart(CAFE, '2026-10-14')!.atLast).toBe(true);
  });

  it('income says «Поступления»', () => {
    const income = dayChart({ ...CAFE, category: { id: 'zp', name: 'Зарплата', type: 'income' } }, null)!;
    expect(plain(income.ariaLabel)).toMatch(/^Поступления по дням, 1–14 октября/);
  });

  it('fewer than 2 operations: no chart', () => {
    expect(dayChart({ ...CAFE, count: 1, records: [CAFE_RECORDS[0]] }, null)).toBeNull();
  });
});

describe('choosing a day', () => {
  const days = dayChart(CAFE, null)!.columns.map((column) => column.date);

  it('a touch picks the nearest day; the same day again clears it', () => {
    expect(tapDay(days, null, 0.3, '2026-10-05')).toBe('2026-10-05');
    expect(tapDay(days, '2026-10-05', 0.3, '2026-10-05')).toBeNull();
    expect(tapDay(days, null, 0.99, '2026-10-05')).toBe('2026-10-14');
    expect(tapDay(days, null, 0, '2026-10-05')).toBe('2026-10-01');
  });

  it('Enter (no position) picks the largest day', () => {
    expect(tapDay(days, null, null, '2026-10-05')).toBe('2026-10-05');
    expect(tapDay(days, '2026-10-05', null, '2026-10-05')).toBeNull();
  });

  it('the arrows step a day and stop at the edges; with none chosen they start from an edge', () => {
    expect(stepDay(days, '2026-10-05', 1)).toBe('2026-10-06');
    expect(stepDay(days, '2026-10-05', -1)).toBe('2026-10-04');
    expect(stepDay(days, '2026-10-01', -1)).toBe('2026-10-01');
    expect(stepDay(days, '2026-10-14', 1)).toBe('2026-10-14');
    expect(stepDay(days, null, -1)).toBe('2026-10-14');
    expect(stepDay(days, null, 1)).toBe('2026-10-01');
  });

  it('the chip over the operations names the day', () => {
    expect(plain(dayChip('2026-10-05'))).toBe('5 октября');
  });

  it('no operations: on the chosen day, in the month', () => {
    expect(noOperationsText(CAFE, '2026-10-04')).toBe('В этот день операций нет');
    expect(noOperationsText(CAFE, null)).toBe('В октябре операций нет');
  });
});
