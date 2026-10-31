import { Calendar, QualityReport, SourceTally, Tally } from './summarize';
import { dayRanges, daysBetween, TASHKENT_OFFSET_HOURS, weekdayOf } from './period';

/**
 * The capture quality report (FT-217) as text for the terminal: counts, shares, dates and the time of the newest record
 * only. The goals are the September ones — 7 records of 10 without a correction, 14 days in a row with records.
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

const RECORDS: [string, string, string] = ['запись', 'записи', 'записей'];
const percent = (part: number, whole: number) => (whole === 0 ? '—' : `${Math.round((part * 100) / whole)}%`);
const outOfTen = (part: number, whole: number) => ((part * 10) / whole).toFixed(1).replace('.', ',');
const range = (low: string, high: string) => (low === high ? low : `${low}–${high}`);
const cleanCount = (tally: Tally) => range(String(tally.clean), String(tally.cleanAtMost));
const cleanOfTen = (tally: Tally) => range(outOfTen(tally.clean, tally.captured), outOfTen(tally.cleanAtMost, tally.captured));

function header(report: QualityReport, dbPath: string): string[] {
  const periodDays = daysBetween(report.from, report.to).length;
  const last = report.lastRecordAt ? `${report.lastRecordAt} по Ташкенту` : 'записей нет';
  const lines = [
    'Kapelka · качество записи (FT-217)',
    `Период: ${report.from} — ${report.to}, ${periodDays} ${plural(periodDays, ['день', 'дня', 'дней'])}; сегодня ${report.today}. ` +
      `День — день операции (date), календарь Ташкента (UTC+${TASHKENT_OFFSET_HOURS}).`,
  ];
  if (report.future) {
    lines.push(`Дни после сегодняшнего (${report.future.from} — ${report.future.to}) не считаются: ещё не наступили.`);
  }
  lines.push(`Копия базы: ${dbPath} — открыта только для чтения. Последняя запись в копии: ${last}.`);
  lines.push(`Пользователей с записями: ${report.users}.`);
  return lines;
}

function headline(report: QualityReport): string[] {
  const { goal, goalAged, manual, others } = report;
  const { streaks } = report.calendar;
  const clean = goal.captured === 0
    ? 'Без правки: записей нет'
    : `Без правки: ${cleanOfTen(goal)} из 10 — ${cleanCount(goal)} из ${goal.captured} записей (цель — ${GOAL_CLEAN_OF_TEN} из 10)`;
  const aged = goalAged.captured === 0
    ? 'среди записей старше 2 дней: таких нет'
    : `среди записей старше 2 дней: ${cleanOfTen(goalAged)} из 10 — ${cleanCount(goalAged)} из ${goalAged.captured}`;
  const today = streaks.todayPending ? '; сегодня записей пока нет' : '';
  const lines = [
    'ИТОГ — автоматическая запись: бот, iOS, Apple Pay, Mini App (фраза или голос)',
    `  ${clean}`,
    `    ${aged}`,
    `  Ждут проверки: ${goal.waiting} — стоит «Нужно проверить» или «?»; в «без правки» не входят`,
    `  Вручную (в цель не входит): ${manual.captured} ${plural(manual.captured, RECORDS)}, без правки ${cleanCount(manual)}`,
  ];
  if (others.captured > 0) {
    lines.push(
      `  Без источника и прочие (в цель не входят): ${others.captured} ${plural(others.captured, RECORDS)}, ` +
        `без правки ${cleanCount(others)}`
    );
  }
  lines.push(
    `  Дней подряд: ${streaks.longest} — самая длинная серия; сейчас: ${streaks.current}${today} ` +
      `(цель — ${GOAL_DAYS_IN_A_ROW}) — по дню операции, все источники`
  );
  return lines;
}

const listed = (days: readonly string[]) => `${days.length}${days.length ? ` — ${dayRanges(days).join(', ')}` : ''}`;

function sentLine(sent: Calendar): string {
  const today = sent.streaks.todayPending ? '; сегодня отправок пока нет' : '';
  return `  По дню отправки (createdAt): самая длинная серия ${sent.streaks.longest}, сейчас ${sent.streaks.current}; ` +
    `дней без отправки: ${listed(sent.daysWithout)}${today}.`;
}

function dayLines(report: QualityReport): string[] {
  const { totals, calendar } = report;
  const lines = ['ЗАПИСИ ПО ДНЯМ — день операции', `  Записано ${totals.captured}: осталось ${totals.kept}, удалено после записи ${totals.deleted}.`];
  for (const day of calendar.days) {
    const kept = day.kept === 0 ? '—' : String(day.kept);
    const notes = [
      ...(day.deleted > 0 ? [`удалено ${day.deleted}`] : []),
      ...(calendar.streaks.todayPending && day.day === report.today ? ['сегодня, день не закончен'] : []),
    ];
    lines.push(`  ${day.day} ${weekdayOf(day.day)}  ${kept.padStart(3)}${notes.length ? `   ${notes.join(', ')}` : ''}`);
  }
  lines.push(`  Дней без записей: ${listed(calendar.daysWithout)}.`);
  lines.push(sentLine(report.sentCalendar));
  lines.push(
    `  Записей, отправленных не в свой день: ${report.late} — день операции не день отправки: сказано про прошлый день, ` +
      'очередь iOS, повтор Telegram.'
  );
  return lines;
}

const COLUMNS: Array<[string, number]> = [['записано', 8], ['доля', 6], ['правка', 8], ['удалено', 9], ['ждут', 6], ['без правки', 13]];

function sourceRow(label: string, row: Tally, total: number, width: number): string {
  const cells = [
    String(row.captured), percent(row.captured, total), String(row.edited), String(row.deleted), String(row.waiting),
    `${cleanCount(row)} из ${row.captured}`,
  ];
  return `  ${label.padEnd(width)}${cells.map((cell, index) => cell.padStart(COLUMNS[index][1])).join('')}`;
}

function sourceLines(report: QualityReport): string[] {
  const sources: SourceTally[] = report.sources;
  const labels = ['источник', 'автоматически', 'всего', ...sources.map(source => source.label)];
  const width = Math.max(...labels.map(label => label.length)) + 2;
  const total = report.totals.captured;
  return [
    'ПО ИСТОЧНИКАМ',
    `  ${'источник'.padEnd(width)}${COLUMNS.map(([title, size]) => title.padStart(size)).join('')}`,
    ...sources.map(source => sourceRow(source.label, source, total, width)),
    sourceRow('автоматически', report.goal, total, width),
    sourceRow('всего', report.totals, total, width),
    '  правка — запись осталась и менялась после записи; удалено — удалили после записи; ждут — стоит «Нужно проверить»',
    '  или «?»; без правки — от и до (раздел «ОТКУДА ЧИСЛА»).',
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
    `  Валюта оплаты не совпала со счётом: ${pay.currencyMismatch} — пометка от валюты; карта при этом могла и совпасть`,
    `  Оплат без пометки, но с правкой после записи: ${pay.editedUnflagged} — если пометку сняли, ` +
      'несопоставленная оплата среди них и отдельно не видна.',
  ];
}

const BASIS = [
  'ОТКУДА ЧИСЛА',
  '  • Без правки — от и до. Нижняя граница: запись не удалена, updatedAt равно createdAt, снимок разбора',
  '    (originalParsing) совпадает с записью, и на ней нет «Нужно проверить» и «?». Верхняя — плюс записи, тронутые',
  '    только там, где снимка нет (счёт, дата, заметка, пометка): среди них подтверждения без изменений — та же',
  '    категория ещё раз в Mini App, «Да, верная» на крупную сумму в боте, снятая пометка у верной записи. Правда — между.',
  '  • Цель «7 из 10» — только автоматическая запись: бот, iOS, Apple Pay, фраза или голос в Mini App (решение',
  '    2026-11-01). Вручную, без источника и прочие — отдельными строками, в цель не входят.',
  '  • Ждут проверки — на записи сейчас стоит «Нужно проверить» или «?»: её ещё никто не проверил, в «без правки» она',
  '    не входит ни нижней, ни верхней границей.',
  '  • Удалённые записи входят в «записано» и считаются правкой: удаление после записи — тоже исправление.',
  '  • День — день операции (date): у iOS и Apple Pay это время с телефона (capturedAt), у бота — время сообщения',
  '    (FT-182). Период выбирается по нему же: запись последнего дня, ушедшая на следующий, в периоде. Вторая серия —',
  '    по дню отправки (createdAt).',
  '  • «правка (по времени изменения)» — updatedAt позже createdAt: в записи что-то меняли. Истории правок в базе нет:',
  '    что именно меняли, видно только там, где есть снимок.',
  '  • Категория, сумма, тип — снимок разбора при записи против записи сейчас; категория — по categoryId снимка',
  '    (пишется с FT-184, 2026-10-30).',
  '  • Счёт и дата — снимка при записи нет. В боте видна только последняя правка сообщения (bot_messages.state.changed):',
  '    это нижняя граница. Mini App и iOS следа не оставляют, кроме времени изменения.',
  '  • «Нужно проверить» при записи — пометка разбора (originalParsing.needsReview) или пометка сейчас. Пометку счёта и',
  '    валюты, которую потом сняли, не видно.',
  '  • «?» хранится только в сообщениях бота (bot_messages.state.guessed) и снимается, когда категорию выбрали или',
  '    подтвердили: сколько «?» было при записи, не известно. У iOS, Apple Pay и Mini App «?» не хранится.',
  '  • Бот: голос и текст — по сообщению бота (у голоса есть «Расслышал»). iOS: голос и текст в базе одинаковы.',
  '  • Суммы, заметки, магазины, фразы и имена не печатаются: запрос к базе отдаёт только дни, источники, время последней',
  '    записи и да/нет.',
  '',
  'ЧЕГО ОТЧЁТ НЕ ВИДИТ',
  '  • Попытки без записи: разбор не удался, «не понял», «без суммы — не записал» — записи нет, считать нечего.',
  '  • Дубли, которые не удалили (оплата Apple Pay и тот же расход голосом): обе записи — «без правки».',
  '  • Свежие записи, которые ещё не успели поправить, — поэтому строка «среди записей старше 2 дней».',
  '  • Правку, которая вернула запись как было: по снимку её нет, по времени изменения — есть.',
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
