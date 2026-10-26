import type { AnalyticsCategoryRow, AnalyticsChange, AnalyticsInsight, MonthAnalytics } from '@/entities/analytics';
import { formatMinor, NBSP } from '@/shared/lib/money';
import type { PastelColor } from '@/shared/lib/pastel/categoryColors';
import { shiftMonth } from '@/shared/lib/dates';
import {
  arrow,
  capitalize,
  diffWords,
  monthHeading,
  monthIn,
  periodWords,
  plural,
  som,
  typeGenitive,
  type PeriodWords,
  type PreviousWords,
} from './periodWords';

/**
 * The analytics screen of a month (FT-121, row «Аналитика — куда уходят деньги», design-system «Аналитика»): the
 * words and the shapes from the numbers of `GET /api/analytics` (FT-120). The API chose what to compare and which
 * insight to tell; this writes them as the boards do.
 */

/** AnalyticsHero.md: the total, what it is compared with, and one insight. */
export interface OverviewHero {
  /** «Расходы · 1–14 октября», «Доходы · сентябрь». */
  label: string;
  /** «7 684 400», «≈ 16 295 000» — без знака, «сум» goes beside it. */
  amount: string;
  /** `balance` (46px); longer than 11 characters — `balance-sm` (38px). */
  large: boolean;
  /** «↑ 10% к 1–14 сентября · на 714 400 сум больше»; none in the first days. */
  compare: string | null;
  insight: string | null;
}

/** A row of CategoryBars.md. */
export interface OverviewRow {
  categoryId: string;
  name: string;
  color: PastelColor;
  /** «1 092 000», «≈ 3 795 000». */
  amount: string;
  /** The bar: the share of the largest value of both periods, 0–100. */
  barPercent: number;
  /** The tick of the previous period on the same scale; null when there is nothing to mark. */
  tickPercent: number | null;
  /** «↑ 40%», «как было», «новое», «пока 60%»; without a comparison the share «28%». */
  meta: string;
  metaTone: 'ink' | 'muted';
  ariaLabel: string;
}

export type OverviewContent =
  | { kind: 'data'; hero: OverviewHero; listLabel: string; legend: string | null; rows: OverviewRow[]; footnote: string }
  | { kind: 'empty'; title: string; text: string; action: string | null };

/** MonthStepper.md: back to the first month of recording, forward to the current one; none while there is one. */
export interface MonthStepper {
  title: string;
  prev: string | null;
  next: string | null;
}

const toMonth = (month: string, delta: number) => {
  const { year, month: number } = shiftMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)), delta);
  return `${year}-${String(number).padStart(2, '0')}`;
};

export function monthStepper(month: string, frame: { firstMonth: string; currentMonth: string }): MonthStepper | null {
  if (frame.firstMonth >= frame.currentMonth) return null;
  return {
    title: monthHeading(month),
    prev: month > frame.firstMonth ? toMonth(month, -1) : null,
    next: month < frame.currentMonth ? toMonth(month, 1) : null,
  };
}

/** «Больше всего — продукты»: a category's name inside a sentence, unless it is an abbreviation («IT»). */
function inSentence(name: string): string {
  const second = name.charAt(1);
  if (second && second === second.toLocaleUpperCase('ru-RU') && second !== second.toLocaleLowerCase('ru-RU')) return name;
  return name.charAt(0).toLocaleLowerCase('ru-RU') + name.slice(1);
}

const approx = (hasUsd: boolean, text: string) => (hasUsd ? `≈${NBSP}${text}` : text);
const amountText = (minor: number) => formatMinor(minor, 'UZS', { unit: false });

/** The change of a row in its column: «↑ 40%», «↓ 15%», «как было», «новое»; income not yet in — «пока 60%», «пока нет». */
function changeMeta(change: AnalyticsChange): string {
  switch (change.kind) {
    case 'up':
    case 'down':
      return arrow(change.kind, change.percent ?? 0);
    case 'same':
      return 'как было';
    case 'new':
      return 'новое';
    case 'so_far':
      return `пока ${change.percent}%`;
    case 'not_yet':
      return 'пока нет';
  }
}

/** The change in words, for a screen reader: «на 40% больше, чем за 1–14 сентября». */
function changeWords(change: AnalyticsChange, previous: PreviousWords): string {
  switch (change.kind) {
    case 'up':
      return `на ${change.percent}% больше, ${previous.than}`;
    case 'down':
      return `на ${change.percent}% меньше, ${previous.than}`;
    case 'same':
      return `столько же, ${previous.like}`;
    case 'new':
      return `${previous.in} не было`;
    case 'so_far':
      return `пока ${change.percent}% от суммы за ${previous.whole}`;
    case 'not_yet':
      return `пока нет, за ${previous.whole} — ${som(-change.diffMinor)}`;
  }
}

/** «Кафе: на 312 000 сум больше, чем за 1–14 сентября» — the one insight the API chose. */
function insightText(insight: AnalyticsInsight | null, data: MonthAnalytics, words: PeriodWords): string | null {
  if (!insight) return null;
  switch (insight.kind) {
    case 'change': {
      const diff = diffWords(insight.direction === 'up' ? insight.diffMinor : -insight.diffMinor);
      return words.previous ? `${insight.name}: ${diff}, ${words.previous.than}` : `${insight.name}: ${diff}`;
    }
    case 'new':
      return words.previous ? `${insight.name}: ${som(insight.amountMinor)} — ${words.previous.in} не было` : `${insight.name}: ${som(insight.amountMinor)}`;
    case 'largest':
      return `Больше всего — ${inSentence(insight.name)}: ${insight.sharePercent}% ${typeGenitive(data.type)}`;
    case 'too_early': {
      const text = `Пока записи за ${insight.days} ${plural(insight.days, 'день', 'дня', 'дней')} — выводы через ${insight.daysLeft} ${plural(insight.daysLeft, 'день', 'дня', 'дней')}`;
      // Recording began this month: there is no month before to compare with until the next one
      const firstMonth = data.firstMonth === data.month && data.month === data.currentMonth;
      return firstMonth ? `${text}, сравнение ${monthIn(toMonth(data.month, 1))}` : text;
    }
  }
}

/** The line under the total. */
function compareText(data: MonthAnalytics, words: PeriodWords): string | null {
  const previous = words.previous;
  if (data.comparable && previous && data.change && data.previousTotalMinor !== null) {
    // Income of a month not over is set against the whole month before and never «falls»
    if (data.type === 'income' && !data.period.wholeMonth) return `За ${previous.whole} — ${som(data.previousTotalMinor)}`;
    const { change } = data;
    if (change.diffMinor === 0) return `Столько же, ${previous.like}`;
    const head = change.kind === 'up' || change.kind === 'down' ? `${arrow(change.kind, change.percent ?? 0)} ${previous.to}` : `Почти ${previous.like}`;
    return `${head} · ${diffWords(change.diffMinor)}`;
  }
  if (!data.previous && !data.firstDays) return 'Первый месяц учёта — сравнивать пока не с чем';
  return null;
}

function footnoteText(data: MonthAnalytics): string {
  const tap = 'Нажмите на категорию, чтобы увидеть операции.';
  const { usd } = data;
  if (!usd.present) return tap;
  if (usd.missingRate || !usd.rateMinor) return `Доллары не вошли: курса пока нет. ${tap}`;
  const by = usd.source === 'own' ? 'по вашему курсу' : 'по курсу ЦБ';
  return `Доллары пересчитаны ${by}: 1 USD = ${som(usd.rateMinor)}. ${tap}`;
}

function rowsOf(data: MonthAnalytics, colorOf: (categoryId: string) => PastelColor | undefined, previous: PreviousWords | null): OverviewRow[] {
  const compared = data.comparable && previous !== null;
  const scale =
    data.categories.reduce((max, item) => Math.max(max, item.amountMinor, compared ? (item.previousMinor ?? 0) : 0), 0) || 1;
  const percentOf = (minor: number) => Math.round((minor / scale) * 1000) / 10;

  return data.categories.map((item: AnalyticsCategoryRow) => {
    const change = compared ? item.change : null;
    const partial = change?.kind === 'so_far' || change?.kind === 'not_yet';
    const share = `${item.sharePercent}%`;
    const amount = approx(item.hasUsd, amountText(item.amountMinor));
    const said = `${item.name}: ${approx(item.hasUsd, som(item.amountMinor))}, ${share} ${typeGenitive(data.type)}`;
    return {
      categoryId: item.categoryId,
      name: item.name,
      color: colorOf(item.categoryId) ?? 'mist',
      amount,
      barPercent: item.amountMinor > 0 ? Math.max(2, percentOf(item.amountMinor)) : 0,
      tickPercent: compared && (item.previousMinor ?? 0) > 0 ? percentOf(item.previousMinor!) : null,
      meta: change ? changeMeta(change) : share,
      metaTone: change && !partial ? 'ink' : 'muted',
      ariaLabel: `${said}${change && previous ? `, ${changeWords(change, previous)}` : ''}. Открыть`,
    };
  });
}

/** The screen of a month: the total and the categories, or what to do when the month is empty. */
export function monthOverview(data: MonthAnalytics, colorOf: (categoryId: string) => PastelColor | undefined): OverviewContent {
  const words = periodWords(data);
  const expenses = data.type === 'expense';

  if (data.totalMinor <= 0) {
    if (data.month !== data.currentMonth) {
      return { kind: 'empty', title: `${capitalize(words.inMonth)} ${typeGenitive(data.type)} не было`, text: 'Выберите другой месяц стрелками выше.', action: null };
    }
    return {
      kind: 'empty',
      title: `${capitalize(words.inMonth)} пока нет ${typeGenitive(data.type)}`,
      text: expenses
        ? `Запишите первую трату — аналитика появится сразу${data.firstDays ? ', а выводы через неделю' : ''}.`
        : 'Запишите первый доход — он появится здесь сразу.',
      action: expenses ? 'Записать трату' : 'Записать доход',
    };
  }

  const amount = approx(data.hasUsd, amountText(data.totalMinor));
  const compared = data.comparable && words.previous !== null;
  return {
    kind: 'data',
    hero: {
      label: `${expenses ? 'Расходы' : 'Доходы'} · ${words.label}`,
      amount,
      large: amount.length <= 11,
      compare: compareText(data, words),
      insight: insightText(data.insight, data, words),
    },
    listLabel: expenses ? 'Расходы по категориям' : 'Доходы по категориям',
    legend: compared ? words.previous!.legend : null,
    rows: rowsOf(data, colorOf, words.previous),
    footnote: footnoteText(data),
  };
}
