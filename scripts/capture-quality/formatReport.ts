import { QualityReport, SourceTally, Tally } from './summarize';
import { dayRanges, daysBetween, TASHKENT_OFFSET_HOURS, weekdayOf } from './period';

/**
 * The capture quality report (FT-217) as text for the terminal: counts, shares and dates only. The goals are the
 * September ones — 7 records of 10 without a correction, 14 days in a row with records.
 */

const GOAL_CLEAN_OF_TEN = 7;
const GOAL_DAYS_IN_A_ROW = 14;

function plural(n: number, forms: [string, string, string]): string {
  const tens = n % 100;
  const ones = n % 10;
  if (tens >= 11 && tens <= 14) return forms[2];
  if (ones === 1) return forms[0];
  if (ones >= 2 && ones <= 4) return forms[1];
  return forms[2];
}

const percent = (part: number, whole: number) => (whole === 0 ? '—' : `${Math.round((part * 100) / whole)}%`);
const outOfTen = (part: number, whole: number) => ((part * 10) / whole).toFixed(1).replace('.', ',');

function header(report: QualityReport, dbPath: string): string[] {
  const periodDays = daysIn(report);
  const lines = [
    'Kapelka · качество записи (FT-217)',
    `Период: ${report.from} — ${report.to}, ${periodDays} ${plural(periodDays, ['день', 'дня', 'дней'])}; сегодня ${report.today}. ` +
      `День записи — по createdAt, календарь Ташкента (UTC+${TASHKENT_OFFSET_HOURS}).`,
  ];
  if (report.future) {
    lines.push(`Дни после сегодняшнего (${report.future.from} — ${report.future.to}) не считаются: ещё не наступили.`);
  }
  lines.push(`Копия базы: ${dbPath} — открыта только для чтения. Пользователей с записями: ${report.users}.`);
  return lines;
}

function daysIn(range: { from: string; to: string }): number {
  return daysBetween(range.from, range.to).length;
}

function headline(report: QualityReport): string[] {
  const { totals, streaks } = report;
  const clean = totals.captured === 0
    ? 'Без правки: записей нет'
    : `Без правки: ${outOfTen(totals.clean, totals.captured)} из 10 — ${totals.clean} из ${totals.captured} записей ` +
      `(цель — ${GOAL_CLEAN_OF_TEN} из 10)`;
  const today = streaks.todayPending ? '; сегодня записей пока нет' : '';
  return [
    'ИТОГ',
    `  ${clean}`,
    `  Дней подряд: ${streaks.longest} — самая длинная серия; сейчас: ${streaks.current}${today} (цель — ${GOAL_DAYS_IN_A_ROW})`,
  ];
}

function dayLines(report: QualityReport): string[] {
  const { totals } = report;
  const lines = ['ЗАПИСИ ПО ДНЯМ', `  Записано ${totals.captured}: осталось ${totals.kept}, удалено после записи ${totals.deleted}.`];
  for (const day of report.days) {
    const kept = day.kept === 0 ? '—' : String(day.kept);
    const notes = [
      ...(day.deleted > 0 ? [`удалено ${day.deleted}`] : []),
      ...(report.streaks.todayPending && day.day === report.today ? ['сегодня, день не закончен'] : []),
    ];
    lines.push(`  ${day.day} ${weekdayOf(day.day)}  ${kept.padStart(3)}${notes.length ? `   ${notes.join(', ')}` : ''}`);
  }
  const without = report.daysWithout;
  lines.push(`  Дней без записей: ${without.length}${without.length ? ` — ${dayRanges(without).join(', ')}` : ''}.`);
  return lines;
}

function sourceRow(label: string, row: Tally, total: number, width: number): string {
  return [
    `  ${label.padEnd(width)}`,
    String(row.captured).padStart(8),
    percent(row.captured, total).padStart(6),
    String(row.edited).padStart(8),
    String(row.deleted).padStart(9),
    `${row.clean} из ${row.captured}`.padStart(12),
  ].join('');
}

function sourceLines(report: QualityReport): string[] {
  const sources: SourceTally[] = report.sources;
  const width = Math.max('источник'.length, 'всего'.length, ...sources.map(source => source.label.length)) + 2;
  const total = report.totals.captured;
  return [
    'ПО ИСТОЧНИКАМ',
    `  ${'источник'.padEnd(width)}${'записано'.padStart(8)}${'доля'.padStart(6)}${'правка'.padStart(8)}` +
      `${'удалено'.padStart(9)}${'без правки'.padStart(12)}`,
    ...sources.map(source => sourceRow(source.label, source, total, width)),
    sourceRow('всего', report.totals, total, width),
    '  правка — запись осталась и менялась после записи; удалено — удалили после записи.',
  ];
}

function correctionLines(report: QualityReport): string[] {
  const c = report.corrections;
  return [
    'ПРАВКИ ПОСЛЕ ЗАПИСИ',
    `  Тронуты после записи — «правка (по времени изменения)»: ${c.edited} из ${c.kept} оставшихся`,
    `    категория — по снимку разбора: ${c.category} (снимок категории есть у ${c.categorySnapshot} из ${c.kept})`,
    `    сумма — по снимку разбора: ${c.amount} (снимок суммы есть у ${c.amountSnapshot} из ${c.kept})`,
    `    тип — по снимку разбора: ${c.type}`,
    `    остальное — счёт, дата, заметка, пометка, «Вернуть»: ${c.other}`,
    `      в боте последней правкой сообщения были счёт: ${c.botAccount}, дата: ${c.botDate}`,
    `  Удалены после записи: ${report.totals.deleted} — считаются правкой.`,
    `  Снимка разбора нет у ${c.withoutParse} из ${c.kept} оставшихся (вручную, сумма боту без фразы): ` +
      'у них видно только время изменения.',
  ];
}

function flagLines(report: QualityReport): string[] {
  const { flags, guess, totals } = report;
  return [
    'ПОМЕТКИ ПРИ ЗАПИСИ',
    `  «Нужно проверить» при записи: ${flags.flagged} из ${totals.captured} (${percent(flags.flagged, totals.captured)}) — ` +
      `так и не тронуты: ${flags.untouched}, пометка стоит сейчас: ${flags.standing}, удалены: ${flags.deleted}`,
    `  «?» у категории (бот): так и не сняли у ${guess.still} из ${guess.botRecords} записей бота; ` +
      `из них запись не тронута: ${guess.stillUntouched}`,
  ];
}

function applePayLines(report: QualityReport): string[] {
  const pay = report.applePay;
  return [
    'APPLE PAY',
    `  Оплат: ${pay.payments}. Без сопоставленной карты, на счёт по умолчанию: ${pay.unmatched} ` +
      '(пометка «Нужно проверить» стоит)',
    `    из них валюта оплаты не совпала со счётом: ${pay.currencyMismatch}`,
    `  Оплат без пометки, но с правкой после записи: ${pay.editedUnflagged} — если пометку сняли, ` +
      'несопоставленная оплата среди них и отдельно не видна.',
  ];
}

const BASIS = [
  'ОТКУДА ЧИСЛА',
  '  • Без правки — запись не удалена, updatedAt равно createdAt, и снимок разбора (originalParsing) совпадает с записью.',
  '    Удалённые записи входят в «записано» и считаются правкой: удаление после записи — тоже исправление.',
  '  • «правка (по времени изменения)» — updatedAt позже createdAt: в записи что-то меняли. Истории правок в базе нет:',
  '    что именно меняли, видно только там, где есть снимок.',
  '  • Категория, сумма, тип — снимок разбора при записи против записи сейчас; категория — по categoryId снимка',
  '    (пишется с FT-184, 2026-10-30). Вернули как было — правки по снимку не видно, по времени изменения видно.',
  '  • Счёт и дата — снимка при записи нет. В боте видна только последняя правка сообщения (bot_messages.state.changed):',
  '    это нижняя граница. Mini App и iOS следа не оставляют, кроме времени изменения.',
  '  • «Нужно проверить» при записи — пометка разбора (originalParsing.needsReview) или пометка сейчас. Пометку счёта и',
  '    валюты, которую потом сняли, не видно.',
  '  • «?» хранится только в сообщениях бота (bot_messages.state.guessed) и снимается, когда категорию выбрали или',
  '    подтвердили: сколько «?» было при записи, не известно. У iOS, Apple Pay и Mini App «?» не хранится.',
  '  • Бот: голос и текст — по сообщению бота (у голоса есть «Расслышал»). iOS: голос и текст в базе одинаковы.',
  '  • Суммы, заметки, магазины, фразы и имена не печатаются: запрос к базе отдаёт только дни, источники и да/нет.',
];

export function formatReport(report: QualityReport, meta: { dbPath: string }): string {
  return [
    ...header(report, meta.dbPath),
    '',
    ...headline(report),
    '',
    ...dayLines(report),
    '',
    ...sourceLines(report),
    '',
    ...correctionLines(report),
    '',
    ...flagLines(report),
    '',
    ...applePayLines(report),
    '',
    ...BASIS,
  ].join('\n');
}
