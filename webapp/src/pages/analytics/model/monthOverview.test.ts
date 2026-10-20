import { describe, expect, it } from 'vitest';
import type { MonthAnalytics } from '@/entities/analytics';
import type { PastelColor } from '@/shared/lib/pastel/categoryColors';
import { AUGUST_FIRST_MONTH, EMPTY, FIRST_DAYS, OCTOBER_EXPENSES, OCTOBER_INCOME, row, SEPTEMBER_EXPENSES } from './fixtures';
import { monthOverview, monthStepper, type OverviewContent } from './monthOverview';

/**
 * FT-121, row «Аналитика — куда уходят деньги»: the words of the analytics screen from the numbers of FT-120 —
 * the total with its fair comparison and one insight, the categories as bars with a tick of the previous period
 * and «↑ 40%», «как было», «новое»; income of an unfinished month «пока нет», «пока 60%»; the first month, the first
 * days and an empty month. Copy and rules from design/prototype/Pastel_Analytics.dc.html and design-system
 * «Аналитика».
 */

const COLORS: Record<string, PastelColor> = { pr: 'peach', dm: 'sand', kf: 'rose', zd: 'mint', zp: 'mint', fr: 'lilac', kb: 'butter' };
const colorOf = (id: string) => COLORS[id];
/** Non-breaking spaces read as spaces: the words are what is checked here. */
const plain = (value: string | null | undefined) => value?.replace(/\u00a0/g, ' ') ?? null;

function data(content: OverviewContent) {
  if (content.kind !== 'data') throw new Error(`expected data, got ${content.kind}`);
  return content;
}
const overview = (answer: MonthAnalytics) => data(monthOverview(answer, colorOf));

describe('the total of the current month (board «Аналитика · расходы»)', () => {
  const view = overview(OCTOBER_EXPENSES);

  it('names the days counted and the sum without a sign; «сум» goes beside it', () => {
    expect(plain(view.hero.label)).toBe('Расходы · 1–14 октября');
    expect(plain(view.hero.amount)).toBe('7 684 400');
    expect(view.hero.large).toBe(true);
  });

  it('compares with the same days of the previous month, in percent and in words', () => {
    expect(plain(view.hero.compare)).toBe('↑ 10% к 1–14 сентября · на 714 400 сум больше');
  });

  it('says the insight the API chose: the biggest growth, in сум against the same days', () => {
    expect(plain(view.hero.insight)).toBe('Кафе: на 312 000 сум больше, чем за 1–14 сентября');
  });

  it('a total longer than 11 characters takes the smaller size', () => {
    expect(overview({ ...OCTOBER_EXPENSES, totalMinor: 12_345_678_900 }).hero.large).toBe(true);
    expect(overview({ ...OCTOBER_EXPENSES, totalMinor: 123_456_789_000 }).hero.large).toBe(false);
  });

  it('an insight of decline and of a category that was not there', () => {
    const down = overview({
      ...OCTOBER_EXPENSES,
      insight: { kind: 'change', categoryId: 'zd', name: 'Здоровье', direction: 'down', diffMinor: 9_000_000, amountMinor: 52_000_000, previousMinor: 61_000_000 },
    });
    expect(plain(down.hero.insight)).toBe('Здоровье: на 90 000 сум меньше, чем за 1–14 сентября');

    const fresh = overview({ ...OCTOBER_EXPENSES, insight: { kind: 'new', categoryId: 'dr', name: 'Подарки', amountMinor: 50_000_000 } });
    expect(plain(fresh.hero.insight)).toBe('Подарки: 500 000 сум — в те же дни сентября не было');
  });
});

describe('categories as bars (CategoryBars.md)', () => {
  const view = overview(OCTOBER_EXPENSES);
  const [groceries, home, cafe, health, other] = view.rows;

  it('the legend names the previous period of the tick', () => {
    expect(plain(view.legend)).toBe('было за 1–14 сентября');
  });

  it('each row: the category, its colour, the sum without a sign and the change', () => {
    expect([groceries.name, groceries.color, plain(groceries.amount), groceries.meta]).toEqual(['Продукты', 'peach', '2 140 000', '↑ 8%']);
    expect(home.meta).toBe('как было');
    expect(cafe.meta).toBe('↑ 40%');
    expect(health.meta).toBe('↓ 15%');
    expect(other.meta).toBe('новое');
    expect(view.rows.every((item) => item.metaTone === 'ink')).toBe(true);
  });

  it('a bar is the share of the largest value of both periods; the tick marks the previous period', () => {
    // The largest of both periods is Продукты now: 2 140 000
    expect(groceries.barPercent).toBe(100);
    expect(groceries.tickPercent).toBeCloseTo((1_980_000 / 2_140_000) * 100, 1);
    expect(cafe.barPercent).toBeCloseTo((1_092_000 / 2_140_000) * 100, 1);
    expect(cafe.tickPercent).toBeCloseTo((780_000 / 2_140_000) * 100, 1);
    // A category new this period has nothing to mark
    expect(other.tickPercent).toBeNull();
  });

  it('a previous period larger than any row now sets the scale', () => {
    const bigger = overview({
      ...OCTOBER_EXPENSES,
      categories: [row({ categoryId: 'pr', name: 'Продукты', amountMinor: 100_000_000, sharePercent: 100, previousMinor: 200_000_000, previousCount: 5, change: { kind: 'down', percent: 50, diffMinor: -100_000_000 } })],
    });
    expect(bigger.rows[0].barPercent).toBe(50);
    expect(bigger.rows[0].tickPercent).toBe(100);
  });

  it('a screen reader hears the sum, the share and the change in words', () => {
    expect(plain(cafe.ariaLabel)).toBe('Кафе: 1 092 000 сум, 14% расходов, на 40% больше, чем за 1–14 сентября. Открыть');
    expect(plain(home.ariaLabel)).toBe('Дом: 1 450 000 сум, 19% расходов, столько же, как за 1–14 сентября. Открыть');
    expect(plain(other.ariaLabel)).toBe('Другое: 300 000 сум, 4% расходов, в те же дни сентября не было. Открыть');
  });

  it('the footnote tells a row opens its operations', () => {
    expect(view.footnote).toBe('Нажмите на категорию, чтобы увидеть операции.');
  });

  it('a category missing from the user’s list keeps a neutral colour', () => {
    expect(data(monthOverview(OCTOBER_EXPENSES, () => undefined)).rows[0].color).toBe('mist');
  });
});

describe('income of an unfinished month (board «Аналитика · доходы»)', () => {
  const view = overview(OCTOBER_INCOME);
  const [salary, freelance, cashback] = view.rows;

  it('converted dollars are marked «≈»; the long total is smaller', () => {
    expect(plain(view.hero.label)).toBe('Доходы · 1–14 октября');
    expect(plain(view.hero.amount)).toBe('≈ 16 295 000');
    expect(view.hero.large).toBe(false);
    expect(plain(freelance.amount)).toBe('≈ 3 795 000');
  });

  it('is set against the whole previous month and never «falls»', () => {
    expect(plain(view.hero.compare)).toBe('За весь сентябрь — 15 210 000 сум');
    expect(plain(view.legend)).toBe('было в сентябре');
    expect(plain(view.hero.insight)).toBe('Фриланс: на 1 265 000 сум больше, чем в сентябре');
  });

  it('a category behind the whole previous month says «пока нет» or «пока 60%», in muted', () => {
    expect([salary.meta, salary.metaTone]).toEqual(['как было', 'ink']);
    expect([freelance.meta, freelance.metaTone]).toEqual(['↑ 50%', 'ink']);
    expect([plain(cashback.amount), cashback.meta, cashback.metaTone]).toEqual(['0', 'пока нет', 'muted']);
    expect(cashback.barPercent).toBe(0);
    expect(cashback.tickPercent).toBeGreaterThan(0);

    const soFar = overview({
      ...OCTOBER_INCOME,
      categories: [row({ categoryId: 'zp', name: 'Зарплата', amountMinor: 750_000_000, sharePercent: 100, previousMinor: 1_250_000_000, previousCount: 1, change: { kind: 'so_far', percent: 60, diffMinor: -500_000_000 } })],
    });
    expect([soFar.rows[0].meta, soFar.rows[0].metaTone]).toEqual(['пока 60%', 'muted']);
    expect(plain(soFar.rows[0].ariaLabel)).toBe('Зарплата: 7 500 000 сум, 100% доходов, пока 60% от суммы за весь сентябрь. Открыть');
  });

  it('the footnote gives the rate the dollars were converted at', () => {
    expect(plain(view.footnote)).toBe('Доллары пересчитаны по курсу ЦБ: 1 USD = 12 650 сум. Нажмите на категорию, чтобы увидеть операции.');
    const own = overview({ ...OCTOBER_INCOME, usd: { present: true, missingRate: false, rateMinor: 1_280_000, source: 'own' } });
    expect(plain(own.footnote)).toBe('Доллары пересчитаны по вашему курсу: 1 USD = 12 800 сум. Нажмите на категорию, чтобы увидеть операции.');
    const missing = overview({ ...OCTOBER_INCOME, usd: { present: true, missingRate: true, rateMinor: null, source: null } });
    expect(plain(missing.footnote)).toBe('Доллары не вошли: курса пока нет. Нажмите на категорию, чтобы увидеть операции.');
  });
});

describe('a past month (board «Аналитика · прошлый месяц»)', () => {
  const view = overview(SEPTEMBER_EXPENSES);

  it('is the whole month against the whole month before', () => {
    expect(plain(view.hero.label)).toBe('Расходы · сентябрь');
    expect(plain(view.hero.compare)).toBe('Почти как в августе · на 40 000 сум меньше');
    expect(plain(view.hero.insight)).toBe('Здоровье: на 340 000 сум больше, чем в августе');
    expect(plain(view.legend)).toBe('было в августе');
    expect(plain(view.rows[1].ariaLabel)).toBe('Здоровье: 860 000 сум, 6% расходов, на 65% больше, чем в августе. Открыть');
  });

  it('a change in percent names the month it is against', () => {
    const up = overview({ ...SEPTEMBER_EXPENSES, change: { kind: 'up', percent: 12, diffMinor: 150_000_000 } });
    expect(plain(up.hero.compare)).toBe('↑ 12% к августу · на 1 500 000 сум больше');
  });
});

describe('the first month of recording (board «Аналитика · первый месяц»)', () => {
  const view = overview(AUGUST_FIRST_MONTH);

  it('says there is nothing to compare with yet and names the largest category', () => {
    expect(plain(view.hero.compare)).toBe('Первый месяц учёта — сравнивать пока не с чем');
    expect(plain(view.hero.insight)).toBe('Больше всего — продукты: 29% расходов');
  });

  it('rows show their share in muted, with no tick and no legend', () => {
    expect(view.legend).toBeNull();
    expect(view.rows.map((item) => [item.meta, item.metaTone, item.tickPercent])).toEqual([
      ['29%', 'muted', null],
      ['22%', 'muted', null],
    ]);
    expect(plain(view.rows[0].ariaLabel)).toBe('Продукты: 3 900 000 сум, 29% расходов. Открыть');
  });
});

describe('the first days of recording (board «Аналитика · первые дни»)', () => {
  const view = overview(FIRST_DAYS);

  it('no comparison; the insight says when the conclusions come', () => {
    expect(plain(view.hero.label)).toBe('Расходы · 1–3 октября');
    expect(view.hero.compare).toBeNull();
    expect(plain(view.hero.insight)).toBe('Пока записи за 3 дня — выводы через 4 дня, сравнение в ноябре');
    expect(view.rows.map((item) => item.meta)).toEqual(['30%', '19%']);
    expect(view.legend).toBeNull();
  });

  it('started late last month: the comparison comes with the conclusions, not next month', () => {
    const late = overview({ ...FIRST_DAYS, firstMonth: '2026-09', today: '2026-10-02', firstDays: { days: 5, daysLeft: 2 }, insight: { kind: 'too_early', days: 5, daysLeft: 2 } });
    expect(plain(late.hero.insight)).toBe('Пока записи за 5 дней — выводы через 2 дня');
  });

  it('the first day itself', () => {
    const first = overview({ ...FIRST_DAYS, today: '2026-10-01', firstDays: { days: 1, daysLeft: 6 }, insight: { kind: 'too_early', days: 1, daysLeft: 6 } });
    expect(plain(first.hero.label)).toBe('Расходы · 1 октября');
    expect(plain(first.hero.insight)).toBe('Пока записи за 1 день — выводы через 6 дней, сравнение в ноябре');
  });
});

describe('an empty month (board «Аналитика · пока пусто», EmptyState.md)', () => {
  it('the current month leads to the first record', () => {
    expect(monthOverview(EMPTY, colorOf)).toEqual({
      kind: 'empty',
      title: 'В октябре пока нет расходов',
      text: 'Запишите первую трату — аналитика появится сразу, а выводы через неделю.',
      action: 'Записать трату',
    });
    expect(monthOverview({ ...EMPTY, type: 'income' }, colorOf)).toEqual({
      kind: 'empty',
      title: 'В октябре пока нет доходов',
      text: 'Запишите первый доход — он появится здесь сразу.',
      action: 'Записать доход',
    });
  });

  it('past the first days the conclusions are not promised again', () => {
    const later = monthOverview({ ...EMPTY, firstDays: null, firstMonth: '2026-08' }, colorOf);
    expect(later.kind === 'empty' && later.text).toBe('Запишите первую трату — аналитика появится сразу.');
  });

  it('a past month without records has no button', () => {
    expect(monthOverview({ ...AUGUST_FIRST_MONTH, totalMinor: 0, categories: [], insight: null }, colorOf)).toEqual({
      kind: 'empty',
      title: 'В августе расходов не было',
      text: 'Выберите другой месяц стрелками выше.',
      action: null,
    });
  });
});

describe('the month stepper (MonthStepper.md)', () => {
  it('goes back no further than the first month of recording and forward no further than now', () => {
    expect(monthStepper('2026-10', OCTOBER_EXPENSES)).toEqual({ title: 'Октябрь 2026', prev: '2026-09', next: null });
    expect(monthStepper('2026-09', OCTOBER_EXPENSES)).toEqual({ title: 'Сентябрь 2026', prev: '2026-08', next: '2026-10' });
    expect(monthStepper('2026-08', OCTOBER_EXPENSES)).toEqual({ title: 'Август 2026', prev: null, next: '2026-09' });
  });

  it('crosses the year', () => {
    expect(monthStepper('2026-01', { firstMonth: '2025-11', currentMonth: '2026-02' })).toEqual({ title: 'Январь 2026', prev: '2025-12', next: '2026-02' });
  });

  it('is hidden while there is one month only', () => {
    expect(monthStepper('2026-10', FIRST_DAYS)).toBeNull();
  });
});
