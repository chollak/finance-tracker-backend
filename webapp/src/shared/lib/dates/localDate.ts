/**
 * Calendar dates as 'YYYY-MM-DD' strings in the device's local time — no time zones, no Date math
 * surprises. Records store a date, not a moment (docs/pastel/money-model.md).
 */
export type LocalDate = string;

const MONTHS_NOMINATIVE = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/** «В октябре потрачено…». */
const MONTHS_PREPOSITIONAL = [
  'январе', 'феврале', 'марте', 'апреле', 'мае', 'июне',
  'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре',
];

export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** Sunday first, as `Date.getDay()` counts. */
const WEEKDAYS_LONG = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

const pad = (value: number) => String(value).padStart(2, '0');

export function toLocalDate(date: Date): LocalDate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseLocalDate(value: LocalDate): { year: number; month: number; day: number } {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

export function addDays(value: LocalDate, days: number): LocalDate {
  const { year, month, day } = parseLocalDate(value);
  return toLocalDate(new Date(year, month - 1, day + days));
}

/** «Октябрь 2026» for the month header. */
export function monthTitle(year: number, month: number): string {
  return `${MONTHS_NOMINATIVE[month - 1]} ${year}`;
}

/** «14 октября» — absolute dates, as the design system asks. */
export function dayMonth(value: LocalDate): string {
  const { month, day } = parseLocalDate(value);
  return `${day} ${MONTHS_GENITIVE[month - 1]}`;
}

/** «октябрь» — for «Доход за октябрь». */
export function monthNameLower(month: number): string {
  return MONTHS_NOMINATIVE[month - 1].toLocaleLowerCase('ru-RU');
}

/** «октябре» — for «В октябре потрачено 47% дохода». */
export function monthNameIn(month: number): string {
  return MONTHS_PREPOSITIONAL[month - 1];
}

/** The first and the last day of the month `value` is in. */
export function monthBounds(value: LocalDate): { from: LocalDate; to: LocalDate } {
  const { year, month } = parseLocalDate(value);
  const lastDay = new Date(year, month, 0).getDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDay)}` };
}

/**
 * Day of a list grouped by days (docs/pastel/components/TransactionList.md): «Сегодня», «Вчера», then
 * «Понедельник, 12 октября»; a day of another year carries the year.
 */
export function dayGroupLabel(value: LocalDate, today: LocalDate): string {
  if (value === today) return 'Сегодня';
  if (value === addDays(today, -1)) return 'Вчера';
  const { year, month, day } = parseLocalDate(value);
  const weekday = WEEKDAYS_LONG[new Date(year, month - 1, day).getDay()];
  const sameYear = year === parseLocalDate(today).year;
  return `${weekday}, ${dayMonth(value)}${sameYear ? '' : ` ${year}`}`;
}

/** «Сегодня», «Вчера» or «14 октября». */
export function relativeDayLabel(value: LocalDate, today: LocalDate): string {
  if (value === today) return 'Сегодня';
  if (value === addDays(today, -1)) return 'Вчера';
  return dayMonth(value);
}

export interface CalendarCell {
  date: LocalDate;
  day: number;
  isToday: boolean;
  isFuture: boolean;
}

/** Weeks of a month starting Monday; null pads the first and last week. */
export function monthGrid(year: number, month: number, today: LocalDate): Array<Array<CalendarCell | null>> {
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const cells: Array<CalendarCell | null> = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${pad(month)}-${pad(day)}`;
    cells.push({ date, day, isToday: date === today, isFuture: date > today });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<CalendarCell | null>> = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}

/** Months are browsable 12 back from today's month and never past it. */
export function monthNavigation(year: number, month: number, today: LocalDate): { canPrev: boolean; canNext: boolean } {
  const { year: ty, month: tm } = parseLocalDate(today);
  const index = year * 12 + (month - 1);
  const todayIndex = ty * 12 + (tm - 1);
  return { canPrev: index > todayIndex - 12, canNext: index < todayIndex };
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}
