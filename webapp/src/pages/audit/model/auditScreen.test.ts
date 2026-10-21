import { describe, expect, it } from 'vitest';
import { applyCandidateChange, applyGoalAnswer, type Audit, type AuditCandidate, type Goal } from '@/entities/audit';
import { BOARD_DONE, BOARD_OPEN, BOARD_PROGRESS, EARLY } from '@/entities/audit/model/fixtures';
import {
  auditFooter,
  auditIntro,
  auditResult,
  auditScreenTitle,
  candidateCard,
  goalLiveText,
  goalRow,
  initialAuditView,
  tooEarlyView,
} from './auditScreen';

/**
 * FT-132, row «Ревизия трат — что было лишним» (design/prototype/Pastel_Audit.dc.html): every text of the audit screen
 * from the API's answers on the board's data — «Ревизия · начало», «разобрано 2 из 6», «итог и цели», «лишнего нет»,
 * «мало данных». Money with non-breaking groups, as `formatMinor` writes it.
 */

/** «2 319 000 сум» → with the non-breaking spaces of money: between digit groups and before «сум». */
const nb = (text: string) => text.replace(/(\d) (?=\d{3}(\D|$))/g, '$1 ').replace(/ сум/g, ' сум');

const candidate = (audit: Audit, id: string): AuditCandidate => audit.candidates.find((entry) => entry.id === id)!;
const goal = (id: string): Goal => BOARD_DONE.goals.find((entry) => entry.id === id)!;
const closed = { open: false, allOps: false };

describe('the title and the too-early state («Ревизия · мало данных»)', () => {
  it('names the month audited; before an audit — «Ревизия трат»', () => {
    expect(auditScreenTitle(BOARD_OPEN)).toBe('Ревизия сентября');
    expect(auditScreenTitle(EARLY)).toBe('Ревизия трат');
  });

  it('says when the first audit comes and how much is recorded, as the board: «за 3 дня из 31»', () => {
    const board: Audit = { ...EARLY, firstAuditOn: '2026-11-01' };
    expect(tooEarlyView(board)).toEqual({
      title: 'Первая ревизия — 1 ноября',
      text: 'Нужен целый месяц записей: тогда ИИ найдёт траты, которые повторяются или растут, и спросит, нужны ли они.',
      progress: 'Записей пока — за 3 дня из 31',
    });
  });

  it('records begun after the 3rd make the next month the first whole one: the line says which', () => {
    expect(tooEarlyView(EARLY)).toMatchObject({ title: 'Первая ревизия — 1 декабря', progress: 'Записей пока — за 3 дня, а нужен целый ноябрь' });
  });

  it('without records', () => {
    expect(tooEarlyView({ ...EARLY, firstRecordDate: null, firstAuditOn: null })).toMatchObject({
      title: 'Первая ревизия — после месяца записей',
      progress: 'Записей пока нет',
    });
  });
});

describe('the list («Ревизия · начало», «Ревизия · разобрано 2 из 6»)', () => {
  it('opens on the list until «Готово»; a done audit and one with nothing found open on the result', () => {
    expect(initialAuditView(BOARD_OPEN)).toBe('list');
    expect(initialAuditView(BOARD_DONE)).toBe('done');
    expect(initialAuditView({ ...BOARD_OPEN, candidates: [], summary: { ...BOARD_OPEN.summary, count: 0, left: 0, totalMinor: 0 } })).toBe('done');
  });

  it('the intro says what the AI found and how much it took, with the progress', () => {
    expect(auditIntro(BOARD_OPEN)).toEqual({
      text: nb('ИИ нашёл 6 трат, которые могут быть лишними, — 2 319 000 сум за сентябрь. Отметьте: нужно или лишнее.'),
      progress: 'Разобрано 0 из 6',
      share: 0,
    });
    expect(auditIntro(BOARD_PROGRESS)).toMatchObject({ progress: 'Разобрано 2 из 6', share: 2 / 6 });
  });

  it('agrees the number: one spending, two of them', () => {
    const only = (count: number): Audit => ({ ...BOARD_OPEN, candidates: BOARD_OPEN.candidates.slice(0, count), summary: { ...BOARD_OPEN.summary, count } });
    expect(auditIntro(only(1)).text).toMatch(/^ИИ нашёл 1 трату, которая может быть лишней, — /);
    expect(auditIntro(only(2)).text).toMatch(/^ИИ нашёл 2 траты, которые могут быть лишними, — /);
  });

  it('names the undecided brought from the audit before apart from what was found', () => {
    const carried: Audit = {
      ...BOARD_OPEN,
      candidates: BOARD_OPEN.candidates.map((entry) => (entry.id === 'taxi' ? { ...entry, carriedFrom: '2026-08' } : entry)),
      summary: { ...BOARD_OPEN.summary, totalMinor: 197_000_000, carriedCount: 1, carriedTotalMinor: 34_900_000 },
    };
    expect(auditIntro(carried).text).toBe(
      nb('ИИ нашёл 5 трат, которые могут быть лишними, — 1 970 000 сум за сентябрь. Ещё 1 — из ревизии августа. Отметьте: нужно или лишнее.')
    );
    expect(candidateCard(candidate(carried, 'taxi'), closed).kindLine).toBe('Часто и понемногу · Транспорт · за август');
  });

  it('a card before a mark: kind and category, title and sum, the reason and its operations', () => {
    expect(candidateCard(candidate(BOARD_OPEN, 'delivery'), closed)).toEqual({
      aria: nb('Стало чаще: Доставка еды — 4 раза, 732 000 сум'),
      kindLine: 'Стало чаще · Кафе',
      title: 'Доставка еды — 4 раза',
      amount: nb('732 000 сум'),
      reason: candidate(BOARD_OPEN, 'delivery').reason,
      opsLabel: 'Показать 4 операции',
      ops: [],
      moreOps: null,
      groupAria: 'Нужна ли трата «Доставка еды»',
      goal: null,
      note: null,
    });
    expect(candidateCard(candidate(BOARD_OPEN, 'headphones'), closed).opsLabel).toBe('Показать операцию');
    expect(candidateCard(candidate(BOARD_OPEN, 'coffee'), closed).opsLabel).toBe('Показать 16 операций');
  });

  it('a subscription’s sum is a month', () => {
    expect(candidateCard(candidate(BOARD_OPEN, 'kinopoisk'), closed).amount).toBe(nb('50 000 сум в месяц'));
  });

  it('operations: newest first, 5 of them, then «Показать все 16»', () => {
    const open = candidateCard(candidate(BOARD_OPEN, 'coffee'), { open: true, allOps: false });
    expect(open.opsLabel).toBe('Скрыть операции');
    expect(open.ops).toEqual(['29', '27', '25', '23', '21'].map((day) => ({ date: `${day} сентября`, amount: nb('28 000 сум') })));
    expect(open.moreOps).toBe('Показать все 16');

    const all = candidateCard(candidate(BOARD_OPEN, 'coffee'), { open: true, allOps: true });
    expect(all.ops).toHaveLength(16);
    expect(all.moreOps).toBeNull();
  });

  it('a marked card folds: «Нужно» says when it comes back, «Лишнее» asks what to do next', () => {
    const need = candidateCard(candidate(BOARD_PROGRESS, 'delivery'), closed);
    expect(need).toMatchObject({ reason: null, goal: null, note: 'Предложим снова, только если трата заметно вырастет.' });
    expect(need.aria).toBe(nb('Стало чаще: Доставка еды — 4 раза, 732 000 сум. Отмечено: нужно'));

    const extra = candidateCard(candidate(BOARD_PROGRESS, 'coffee'), closed);
    expect(extra).toMatchObject({
      reason: null,
      note: null,
      goal: { choices: true, choice: 'half', text: nb('Лимит 224 000 сум в месяц · экономия 224 000 сум') },
    });
    expect(extra.aria).toMatch(/\. Отмечено: лишнее$/);

    const dropped = applyCandidateChange(BOARD_PROGRESS, 'coffee', { goal: 'drop' });
    expect(candidateCard(candidate(dropped, 'coffee'), closed).goal).toEqual({ choices: true, choice: 'drop', text: nb('Экономия 448 000 сум в месяц') });
  });

  it('a subscription only gets cancelled, a tariff switched off; a one-off purchase gets no goal', () => {
    expect(candidateCard(candidate(BOARD_DONE, 'kinopoisk'), closed).goal).toEqual({
      choices: false,
      choice: null,
      text: nb('Отменить подписку · экономия 50 000 сум в месяц'),
    });
    const tariff = applyCandidateChange(BOARD_OPEN, 'second-number', { decision: 'extra' });
    expect(candidateCard(candidate(tariff, 'second-number'), closed).goal?.text).toBe(nb('Отключить тариф · экономия 50 000 сум в месяц'));

    expect(candidateCard(candidate(BOARD_DONE, 'headphones'), closed)).toMatchObject({
      goal: null,
      note: 'Разовая покупка — цель не нужна. Войдёт в итог «ушло на лишнее».',
    });
    const needed = applyCandidateChange(BOARD_OPEN, 'headphones', { decision: 'need' });
    expect(candidateCard(candidate(needed, 'headphones'), closed).note).toBe('Учтём: такие покупки для вас нормальны.');
  });

  it('the footer: nothing and «Отметьте хотя бы одну» before a mark; then the saving and what is left', () => {
    expect(auditFooter(BOARD_OPEN)).toEqual({ plan: null, left: null, ready: false, label: 'Отметьте хотя бы одну' });
    expect(auditFooter(BOARD_PROGRESS)).toEqual({
      plan: nb('Экономия 224 000 сум в месяц'),
      left: 'Лишнее: 1 из 6 · 4 разберёте позже',
      ready: true,
      label: 'Готово',
    });
    expect(auditFooter(applyCandidateChange(BOARD_OPEN, 'delivery', { decision: 'need' }))).toEqual({
      plan: null,
      left: 'Пока лишнего нет · 5 разберёте позже',
      ready: true,
      label: 'Готово',
    });
    expect(auditFooter(BOARD_DONE).left).toBe('Лишнее: 5 из 6');
  });
});

describe('the result («Ревизия · итог и цели»)', () => {
  it('a plan, not a reproach: the saving a month, what went on the extra, and how this month goes', () => {
    expect(auditResult(BOARD_DONE)).toEqual({
      heroLabel: 'Итог · отмечено 6 из 6',
      plan: {
        amount: nb('814 000'),
        text: nb('Столько сэкономите, если держаться целей. В сентябре на лишнее ушло 1 504 000 сум.'),
      },
      noPlan: null,
      trend: nb('По этим тратам с 1 октября — 365 400 сум, за те же дни сентября — 774 000 сум: уже на 53% меньше'),
      goalsSub: 'Считаем с 14 октября — дня ревизии',
      oneOff: nb('Наушники — 690 000 сум'),
      need: 'Второй номер',
      next: 'Цели появятся на главной, а у лимита напишем в боте. Следующая ревизия — 1 ноября, за октябрь.',
      canEdit: true,
    });
  });

  // The bot tells a goal at 80% of its limit and over it (FT-133): said only while it really will
  it('«а у лимита напишем в боте» only with a limit to watch and «Цели и подписки» on', () => {
    expect(auditResult(BOARD_DONE, { goalAlertsEnabled: false }).next).toBe('Цели появятся на главной. Следующая ревизия — 1 ноября, за октябрь.');
    const noLimit = ['delivery', 'coffee', 'taxi'].reduce(
      (audit, id) => applyCandidateChange(audit, id, { goal: 'drop' }),
      BOARD_DONE
    );
    expect(auditResult(noLimit).next).toBe('Цели появятся на главной. Следующая ревизия — 1 ноября, за октябрь.');
    expect(auditResult(BOARD_DONE, { goalAlertsEnabled: true }).next).toBe(
      'Цели появятся на главной, а у лимита напишем в боте. Следующая ревизия — 1 ноября, за октябрь.'
    );
  });

  it('the overall line says «пока на … больше» when the month goes worse', () => {
    const worse: Audit = { ...BOARD_DONE, comparison: { amountMinor: 86_700_000, previousMinor: 77_400_000, percent: 12 } };
    expect(auditResult(worse).trend).toMatch(/: пока на 12% больше$/);
  });

  it('a goal to halve: the limit, the bar and what is spent since the audit day, with the same days of September', () => {
    expect(goalRow(goal('goal-delivery'))).toEqual({
      name: 'Доставка еды',
      goal: nb('лимит 366 000 сум в месяц'),
      bar: 0,
      status: nb('Потрачено 0 из 213 000 сум до 31 октября'),
      trend: nb('С 1 октября — ни разу, а за те же дни сентября — 366 000 сум'),
      actions: null,
    });
    expect(goalRow(goal('goal-taxi'))).toMatchObject({
      bar: 24 / 102,
      status: nb('Потрачено 24 000 из 102 000 сум до 31 октября'),
      trend: nb('С 1 октября — 262 400 сум, за те же дни сентября — 184 000 сум: на 43% больше'),
    });
    expect(goalRow(goal('goal-coffee')).trend).toBe(nb('С 1 октября — 103 000 сум, за те же дни сентября — 224 000 сум: на 54% меньше'));
  });

  it('over the limit it says by how much', () => {
    const over = { ...goal('goal-taxi'), spentMinor: 13_000_000 };
    expect(goalRow(over)).toMatchObject({ bar: 1, status: nb('Потрачено 130 000 сум — на 28 000 больше лимита до 31 октября') });
  });

  it('a goal to give up', () => {
    const drop: Goal = { ...goal('goal-coffee'), kind: 'drop', limitMinor: 0, periodLimitMinor: 0 };
    expect(goalRow(drop)).toMatchObject({ goal: 'цель: отказаться', bar: null, status: 'Пока ни разу' });
    expect(goalRow({ ...drop, spentMinor: 5_600_000 }).status).toBe(nb('Потрачено 56 000 сум'));
  });

  it('a subscription: the next charge, «Уже отменено» and «Напомнить» the day before', () => {
    const kinopoisk = goal('goal-kinopoisk');
    expect(goalRow(kinopoisk)).toEqual({
      name: 'Кинопоиск',
      goal: 'цель: отменить',
      bar: null,
      status: 'Следующее списание — 3 ноября. Отмените в самом сервисе до этой даты.',
      trend: null,
      actions: {
        done: { label: 'Уже отменено', aria: 'Уже отменено: Кинопоиск' },
        remind: { label: 'Напомнить 2 ноября', aria: 'Напомнить про «Кинопоиск» 2 ноября' },
      },
    });

    const reminded = goalRow(applyGoalAnswer(kinopoisk, 'remind'));
    expect(reminded.status).toBe('Напомним в боте 2 ноября. Следующее списание — 3 ноября.');
    expect(reminded.actions).toEqual({ done: { label: 'Уже отменено', aria: 'Уже отменено: Кинопоиск' }, remind: null });

    const cancelled = goalRow(applyGoalAnswer(kinopoisk, 'cancelled'));
    expect(cancelled).toMatchObject({ status: 'Отменено — больше не спишут', actions: null });

    expect(goalLiveText(kinopoisk, 'cancelled')).toBe('Кинопоиск: отменено — больше не спишут');
    expect(goalLiveText(kinopoisk, 'remind')).toBe('Напомним про «Кинопоиск» 2 ноября');
  });

  it('an operator’s tariff is switched off at the operator', () => {
    const tariff: Goal = { ...goal('goal-kinopoisk'), name: 'Второй номер', serviceKey: 'second-number', serviceKind: 'tariff' };
    expect(goalRow(tariff)).toMatchObject({
      goal: 'цель: отключить',
      status: 'Следующее списание — 3 ноября. Отключите у оператора до этой даты.',
      actions: { done: { label: 'Уже отключено', aria: 'Уже отключено: Второй номер' } },
    });
    expect(goalRow(applyGoalAnswer(tariff, 'cancelled')).status).toBe('Отключено — больше не спишут');
  });

  it('«Ревизия · лишнего нет»: everything needed', () => {
    const clean = BOARD_OPEN.candidates.reduce((audit, entry) => applyCandidateChange(audit, entry.id, { decision: 'need' }), BOARD_OPEN);
    expect(auditResult({ ...clean, state: 'done', doneOn: '2026-10-14' })).toEqual({
      heroLabel: 'Итог · отмечено 6 из 6',
      plan: null,
      noPlan: { title: 'Лишнего не нашлось', text: 'Все траты вы отметили как нужные.' },
      trend: null,
      goalsSub: 'Считаем с 14 октября — дня ревизии',
      oneOff: null,
      need: 'Доставка еды, Наушники, Кофе, Такси, Второй номер, Кинопоиск',
      next: 'Следующая ревизия — 1 ноября, за октябрь.',
      canEdit: true,
    });
  });

  it('nothing found, some still undecided, only one-off purchases', () => {
    const nothing: Audit = { ...BOARD_OPEN, candidates: [], summary: { ...BOARD_OPEN.summary, count: 0, left: 0, totalMinor: 0 } };
    expect(auditResult(nothing)).toMatchObject({
      heroLabel: 'Итог · сентябрь',
      noPlan: { title: 'Лишнего не нашлось', text: 'Траты сентября обычные: ничего не выросло и не повторялось сверх привычного.' },
      canEdit: false,
    });

    const partly = applyCandidateChange(applyCandidateChange(BOARD_OPEN, 'delivery', { decision: 'need' }), 'coffee', { decision: 'need' });
    expect(auditResult(partly)).toMatchObject({
      noPlan: { title: 'Пока лишнего нет', text: 'Нужными отмечено 2 из 6. Остальные разберёте позже.' },
      next: 'Следующая ревизия — 1 ноября, за октябрь. В неё войдут и 4 неразобранные траты.',
    });

    const oneOff = applyCandidateChange(BOARD_OPEN, 'headphones', { decision: 'extra' });
    expect(auditResult(oneOff)).toMatchObject({
      noPlan: { title: 'Цели не нужны', text: 'Лишнее — только разовые покупки, их не нужно ограничивать.' },
      oneOff: nb('Наушники — 690 000 сум'),
    });
  });

  it('undecided spending brought from the audit before does not come again', () => {
    const carried: Audit = {
      ...BOARD_PROGRESS,
      candidates: BOARD_PROGRESS.candidates.map((entry) => (entry.id === 'taxi' ? { ...entry, carriedFrom: '2026-08' } : entry)),
    };
    expect(auditResult(carried).next).toBe('Цели появятся на главной, а у лимита напишем в боте. Следующая ревизия — 1 ноября, за октябрь. В неё войдут и 3 неразобранные траты.');
  });
});
