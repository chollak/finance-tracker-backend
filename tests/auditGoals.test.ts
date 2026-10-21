import { AuditCandidate, AuditRecord, findAuditCandidates } from '../src/modules/audit/domain/auditRules';
import {
  AUDIT_DECISION_RULES,
  AuditItem,
  auditMonthOn,
  auditSummary,
  goalOf,
  nextAuditOn,
  openAuditItems,
  refoundAuditItems,
  sameAuditItems,
} from '../src/modules/audit/domain/audit';
import {
  GOAL_RULES,
  Goal,
  addMonthsClipped,
  combinedComparison,
  goalDraftOf,
  goalProgress,
  goalSavingMinor,
  halfLimitMinor,
  nextChargeOn,
  roundToThousand,
  suggestedRemindOn,
} from '../src/modules/audit/domain/goal';
import { PROTOTYPE_CATEGORIES, prototypeRecords } from './helpers/auditPrototype';

const sum = (value: number) => value * 100;

/** The board «Ревизия трат»: September's audit, held on 14 October (`today` in `renderVals()`). */
const AUDIT_DAY = '2026-10-14';
const candidates = findAuditCandidates({ month: '2026-09', records: prototypeRecords(), firstRecordDate: '2026-08-01' });
const byName = (name: string) => candidates.find(candidate => candidate.name === name)!;

const item = (candidate: AuditCandidate, decision: AuditItem['decision'], goalChoice: AuditItem['goalChoice'] = null): AuditItem => ({
  ...candidate,
  id: `item-${candidate.name}`,
  carriedFrom: null,
  decision,
  goalChoice,
});

/** The board's preset «done» (Pastel_AuditDone): everything extra but «Второй номер», which is needed. */
const doneItems = candidates.map(candidate => item(candidate, candidate.name === 'Второй номер' ? 'need' : 'extra'));

function goalOfItem(audited: AuditItem, doneOn = AUDIT_DAY): Goal {
  const draft = goalDraftOf(audited, doneOn)!;
  return {
    ...draft,
    id: `goal-${audited.name}`,
    userId: 'user-1',
    auditId: 'audit-1',
    subscriptionState: null,
    remindOn: null,
    cancelledOn: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** FT-131: what a decision of the audit makes, and how goals count from the audit day (design-system «Ревизия трат»). */
describe('audit decisions and goals (FT-131)', () => {
  describe('the audit of a day', () => {
    it('is the audit of the month before, and the next one opens on the 1st of the next month', () => {
      expect(auditMonthOn('2026-10-14')).toBe('2026-09');
      expect(auditMonthOn('2026-01-01')).toBe('2025-12');
      expect(nextAuditOn('2026-10-14')).toBe('2026-11-01');
      expect(nextAuditOn('2026-12-31')).toBe('2027-01-01');
    });
  });

  describe('the candidates found again before the first mark (FT-142)', () => {
    it('keep the id of the same spending, also when its note group widens; a spending found anew keeps its own', () => {
      const taxi = item(byName('Такси'), null);
      const kept: AuditItem[] = [
        // Read when September had only «Такси домой»; a plain «Такси» recorded since widens the group
        { ...taxi, id: 'kept-taxi', key: `${taxi.categoryId}|такси домой`, noteKey: 'такси домой' },
        { ...item(byName('Кофе'), null), id: 'kept-coffee' },
        { ...item(byName('Наушники'), null), id: 'kept-brought', carriedFrom: '2026-08' },
      ];
      const found: AuditItem[] = [
        { ...taxi, id: 'new-taxi' },
        { ...item(byName('Кофе'), null), id: 'new-coffee', count: 17 },
        // Found by this month's rules now, not brought: not the brought one
        { ...item(byName('Наушники'), null), id: 'new-headphones' },
        { ...item(byName('Кинопоиск'), null), id: 'new-cinema' },
      ];
      const refound = refoundAuditItems(kept, found);
      expect(refound.map(entry => entry.id)).toEqual(['kept-taxi', 'kept-coffee', 'new-headphones', 'new-cinema']);
      expect(refound[1].count).toBe(17);
    });

    it('say the same whatever order their fields were written in', () => {
      const coffee = item(byName('Кофе'), null);
      const reordered = Object.fromEntries(Object.entries(coffee).reverse()) as unknown as AuditItem;
      expect(sameAuditItems([coffee], [reordered])).toBe(true);
      expect(sameAuditItems([coffee], [{ ...coffee, count: 17 }])).toBe(false);
      expect(sameAuditItems([coffee], [])).toBe(false);
    });
  });

  describe('the goal a decision makes', () => {
    it('gives a repeating extra spending «Вдвое меньше» unless «Отказаться» is chosen, a subscription only «Отменить»', () => {
      expect(goalOf(item(byName('Кофе'), 'extra'))).toBe('half');
      expect(goalOf(item(byName('Кофе'), 'extra', 'drop'))).toBe('drop');
      expect(goalOf(item(byName('Кинопоиск'), 'extra'))).toBe('cancel');
      expect(goalOf(item(byName('Второй номер'), 'extra', 'half'))).toBe('cancel');
    });

    it('gives none to a one-off purchase, a needed spending or one not decided yet; a chosen goal waits for «Лишнее»', () => {
      expect(goalOf(item(byName('Наушники'), 'extra'))).toBeNull();
      expect(goalOf(item(byName('Кофе'), 'need', 'drop'))).toBeNull();
      expect(goalOf(item(byName('Кофе'), null, 'drop'))).toBeNull();
    });
  });

  describe('the plan of the board «Ревизия · итог и цели»', () => {
    it('saves 814 000 сум a month; 1 504 000 сум went on the extra in September', () => {
      expect(auditSummary(doneItems)).toEqual({
        count: 6,
        marked: 6,
        left: 0,
        extraCount: 5,
        needCount: 1,
        goalCount: 4,
        totalMinor: sum(2319000),
        planMinor: sum(814000),
        wastedMinor: sum(1504000),
        carriedCount: 0,
        carriedTotalMinor: 0,
        carriedWastedMinor: 0,
      });
    });

    it('sums only the month audited; what came from the audit before is counted apart (FT-142)', () => {
      const taxi = item(byName('Такси'), 'extra');
      const coffee: AuditItem = { ...item(byName('Кофе'), 'extra', 'drop'), carriedFrom: '2026-08' };
      const headphones: AuditItem = { ...item(byName('Наушники'), null), carriedFrom: '2026-08' };
      expect(auditSummary([taxi, coffee, headphones])).toEqual({
        count: 3,
        marked: 2,
        left: 1,
        extraCount: 2,
        needCount: 0,
        goalCount: 2,
        // September's own: the taxi, 349 000 сум, of which 174 000 above its limit went on the extra
        totalMinor: sum(349000),
        wastedMinor: sum(174000),
        // Brought from August: coffee given up and the headphones not decided yet
        carriedCount: 2,
        carriedTotalMinor: sum(448000 + 690000),
        carriedWastedMinor: sum(448000),
        // The plan is a month from now on: the goal of a brought spending counts
        planMinor: sum(174000 + 448000),
      });
    });

    it('limits «Вдвое меньше» to half the month rounded to a thousand: 366 000, 224 000 and 175 000 сум', () => {
      expect(halfLimitMinor(byName('Доставка еды').monthlyMinor)).toBe(sum(366000));
      expect(halfLimitMinor(byName('Кофе').monthlyMinor)).toBe(sum(224000));
      expect(halfLimitMinor(byName('Такси').monthlyMinor)).toBe(sum(175000)); // 349 000 / 2 = 174 500
    });

    it('counts the board «разобрано 2 из 6»: a needed delivery saves nothing, coffee at half saves 224 000 сум', () => {
      const progress = candidates.map(candidate => {
        if (candidate.name === 'Доставка еды') return item(candidate, 'need');
        if (candidate.name === 'Кофе') return item(candidate, 'extra');
        return item(candidate, null);
      });
      expect(auditSummary(progress)).toMatchObject({ count: 6, marked: 2, left: 4, extraCount: 1, needCount: 1, goalCount: 1, planMinor: sum(224000), wastedMinor: sum(224000) });
    });

    it('saves the whole month of a spending given up or a subscription cancelled; a purchase only goes on the extra', () => {
      const coffee = item(byName('Кофе'), 'extra', 'drop');
      expect(auditSummary([coffee])).toMatchObject({ planMinor: sum(448000), wastedMinor: sum(448000) });
      expect(auditSummary([item(byName('Наушники'), 'extra')])).toMatchObject({ goalCount: 0, planMinor: 0, wastedMinor: sum(690000) });
    });
  });

  describe('a goal, counted from the audit day', () => {
    const records = prototypeRecords();
    const progressOf = (name: string, choice: AuditItem['goalChoice'] = null, today = AUDIT_DAY) =>
      goalProgress(goalOfItem(item(byName(name), 'extra', choice)), records, today);

    it('lasts from the audit day to the end of its month', () => {
      expect(goalOfItem(item(byName('Такси'), 'extra'))).toMatchObject({
        kind: 'half', startsOn: '2026-10-14', endsOn: '2026-10-31', monthlyMinor: sum(349000), limitMinor: sum(175000),
      });
    });

    it('gives the rest of the month its share of the limit, to a thousand: «Потрачено 24 000 из 102 000 сум до 31 октября»', () => {
      expect(progressOf('Такси')).toMatchObject({ periodLimitMinor: sum(102000), spentMinor: sum(24000), count: 1 });
      expect(progressOf('Доставка еды')).toMatchObject({ periodLimitMinor: sum(213000), spentMinor: 0, count: 0 });
      expect(progressOf('Кофе')).toMatchObject({ periodLimitMinor: sum(130000), spentMinor: 0 });
    });

    it('prorates by the days left, the audit day included', () => {
      const taxi = item(byName('Такси'), 'extra');
      expect(goalProgress(goalOfItem(taxi, '2026-10-01'), records, '2026-10-14').periodLimitMinor).toBe(sum(175000));
      // 175 000 × 1 / 31 = 5 645 → 6 000
      expect(goalProgress(goalOfItem(taxi, '2026-10-31'), records, '2026-10-31').periodLimitMinor).toBe(sum(6000));
    });

    it('compares the month so far with the same days of the month before, as the board does', () => {
      expect(progressOf('Такси').comparison).toEqual({
        from: '2026-10-01', amountMinor: sum(262400), previousFrom: '2026-09-01', previousTo: '2026-09-14', previousMinor: sum(184000), percent: 43,
      });
      expect(progressOf('Кофе').comparison).toMatchObject({ amountMinor: sum(103000), previousMinor: sum(224000), percent: -54 });
      // «С 1 октября — ни разу, а за те же дни сентября — 366 000 сум»
      expect(progressOf('Доставка еды').comparison).toMatchObject({ amountMinor: 0, previousMinor: sum(366000), percent: -100 });
    });

    it('sums the comparison of all goals: «365 400 сум, за те же дни сентября — 774 000 сум: уже на 53% меньше»', () => {
      const comparisons = ['Доставка еды', 'Кофе', 'Такси'].map(name => progressOf(name).comparison);
      expect(combinedComparison([...comparisons, progressOf('Кинопоиск').comparison])).toEqual({
        amountMinor: sum(365400), previousMinor: sum(774000), percent: -53,
      });
    });

    it('says nothing to compare with when the same days of the month before had none of it', () => {
      const lunch: AuditRecord = { id: 'n1', date: '2026-10-15', amountMinor: sum(50000), categoryId: PROTOTYPE_CATEGORIES.kf.id, categoryName: 'Кафе', categoryPresetKey: 'cafe', note: 'Бизнес-ланч' };
      const goal = { ...goalOfItem(item(byName('Кофе'), 'extra')), noteKey: 'бизнес ланч', name: 'Бизнес-ланч' };
      expect(goalProgress(goal, [lunch], '2026-10-20').comparison).toBeNull();
      expect(combinedComparison([null, null])).toBeNull();
    });

    it('compares the 31st with the last day of a shorter month', () => {
      const taxi = (id: string, date: string, amount: number): AuditRecord =>
        ({ id, date, amountMinor: sum(amount), categoryId: PROTOTYPE_CATEGORIES.tr.id, categoryName: 'Транспорт', categoryPresetKey: 'transport', note: 'Такси' });
      const goal = goalOfItem(item(byName('Такси'), 'extra'), '2026-03-10');
      expect(goalProgress(goal, [taxi('f', '2026-02-28', 30000), taxi('m', '2026-03-31', 15000)], '2026-03-31').comparison).toEqual({
        from: '2026-03-01', amountMinor: sum(15000), previousFrom: '2026-02-01', previousTo: '2026-02-28', previousMinor: sum(30000), percent: -50,
      });
    });

    it('counts the spending under all its notes: «Такси домой» and «Такси в аэропорт» are «Такси»', () => {
      // 12 Oct «Такси в аэропорт» 85 000, 13 Oct «Такси домой» 32 000, 14 Oct «Такси» 24 000
      expect(goalProgress(goalOfItem(item(byName('Такси'), 'extra'), '2026-10-12'), records, AUDIT_DAY)).toMatchObject({ spentMinor: sum(141000), count: 3 });
    });

    it('counts a spending given up from the audit day, with no limit, and saves its whole month', () => {
      const coffee = goalOfItem(item(byName('Кофе'), 'extra', 'drop'), '2026-10-08');
      expect(coffee).toMatchObject({ kind: 'drop', limitMinor: 0 });
      expect(goalProgress(coffee, records, AUDIT_DAY)).toMatchObject({ periodLimitMinor: 0, spentMinor: sum(53000), count: 2 });
      expect(goalSavingMinor(coffee)).toBe(sum(448000));
      expect(goalSavingMinor(goalOfItem(item(byName('Такси'), 'extra')))).toBe(sum(174000));
    });

    it('rounds to a thousand сум, half up', () => {
      expect(GOAL_RULES.roundingMinor).toBe(sum(1000));
      expect(roundToThousand(sum(174500))).toBe(sum(175000));
      expect(roundToThousand(sum(1499))).toBe(sum(1000));
      expect(roundToThousand(sum(212516))).toBe(sum(213000));
    });
  });

  describe('a subscription to cancel', () => {
    const records = prototypeRecords();
    const cinema = goalOfItem(item(byName('Кинопоиск'), 'extra'));

    it('is charged next a month after its last charge: «Следующее списание — 3 ноября», «Напомнить 2 ноября»', () => {
      expect(cinema).toMatchObject({ kind: 'cancel', serviceKey: 'kinopoisk', lastChargeOn: '2026-09-05', chargeMonths: 1, limitMinor: 0 });
      expect(goalProgress(cinema, records, AUDIT_DAY)).toMatchObject({
        periodLimitMinor: 0,
        comparison: null,
        subscription: { state: null, lastChargeOn: '2026-10-03', nextChargeOn: '2026-11-03', remindOn: '2026-11-02', chargeMinor: sum(50000) },
      });
      expect(goalSavingMinor(cinema)).toBe(sum(50000));
    });

    // «3 ноября Кинопоиск спишет 50 000 сум» (FT-133): the last charge as recorded, all of it on that day
    it('charges what it charged last time; without the charge recorded, the month times the months between charges', () => {
      const dearer = [...records, { ...records.find(entry => entry.note === 'Кинопоиск' && entry.date === '2026-10-03')!, id: 'extra-charge', amountMinor: sum(9000) }];
      expect(goalProgress(cinema, dearer, AUDIT_DAY).subscription?.chargeMinor).toBe(sum(59000));
      const yearly = { ...cinema, monthlyMinor: sum(33333), chargeMonths: 12, lastChargeOn: '2026-09-10' };
      expect(goalProgress(yearly, [], AUDIT_DAY).subscription).toMatchObject({ lastChargeOn: '2026-09-10', nextChargeOn: '2027-09-10', chargeMinor: sum(399996) });
      expect(goalProgress({ ...cinema, lastChargeOn: null }, [], AUDIT_DAY).subscription?.chargeMinor).toBeNull();
    });

    it('tells the reminder day kept once «Напомнить» is pressed, and nothing to remind once cancelled', () => {
      expect(goalProgress({ ...cinema, subscriptionState: 'remind', remindOn: '2026-11-02' }, records, '2026-10-20').subscription)
        .toMatchObject({ state: 'remind', remindOn: '2026-11-02' });
      expect(goalProgress({ ...cinema, subscriptionState: 'cancelled', cancelledOn: AUDIT_DAY }, records, '2026-10-20').subscription)
        .toMatchObject({ state: 'cancelled', remindOn: null });
    });

    it('keeps the day of the month: 31 January is charged again on 28 February, then on 31 March', () => {
      expect(addMonthsClipped('2026-01-31', 1)).toBe('2026-02-28');
      expect(addMonthsClipped('2026-01-31', 2)).toBe('2026-03-31');
      expect(nextChargeOn('2026-01-31', 1, '2026-02-28')).toBe('2026-03-31');
      // A charge today is behind: the next one is a month later
      expect(nextChargeOn('2026-10-03', 1, '2026-10-03')).toBe('2026-11-03');
    });

    it('reminds the day before the charge, but not before today', () => {
      expect(suggestedRemindOn('2026-11-03', AUDIT_DAY)).toBe('2026-11-02');
      expect(suggestedRemindOn('2026-10-15', AUDIT_DAY)).toBe(AUDIT_DAY);
    });

    it('is charged a year after a yearly charge', () => {
      const yearly: AuditCandidate = { ...byName('Кинопоиск'), amountMinor: sum(400000), monthlyMinor: Math.round(sum(400000) / 12) };
      expect(goalDraftOf(item(yearly, 'extra'), AUDIT_DAY)).toMatchObject({ chargeMonths: 12 });
    });
  });

  describe('opening the next audit', () => {
    let ids = 0;
    const newId = () => `new-${++ids}`;
    const cand = (name: string, fields: Partial<AuditCandidate> = {}): AuditCandidate => ({
      ...byName('Кофе'),
      key: `cat-cafe|${name.toLowerCase()}`,
      name,
      title: name,
      noteKey: name.toLowerCase(),
      serviceKey: null,
      ...fields,
    });

    it('brings what was left undecided in the month before, once, unless the rules find it again', () => {
      const september = {
        month: '2026-09',
        items: [
          { ...item(cand('Кофе'), null), id: 's1' },
          { ...item(cand('Обед'), null), id: 's2' },
          { ...item(cand('Ужин'), 'extra'), id: 's3' },
          { ...item(cand('Кино'), null), id: 's4', carriedFrom: '2026-08' },
        ],
      };
      const opened = openAuditItems({ month: '2026-10', found: [cand('Кофе', { amountMinor: sum(500000) })], earlier: [september], cancelled: [], newId });

      expect(opened.map(entry => [entry.name, entry.carriedFrom, entry.decision, entry.amountMinor])).toEqual([
        ['Кофе', null, null, sum(500000)],
        ['Обед', '2026-09', null, byName('Кофе').amountMinor],
      ]);
      expect(new Set(opened.map(entry => entry.id)).size).toBe(2);
      expect(opened.every(entry => entry.id.startsWith('new-'))).toBe(true);
    });

    it('brings nothing from an older audit than the month before', () => {
      const august = { month: '2026-08', items: [{ ...item(cand('Обед'), null), id: 'a1' }] };
      expect(openAuditItems({ month: '2026-10', found: [], earlier: [august], cancelled: [], newId })).toEqual([]);
    });

    it('does not offer what was needed again until it grows notably', () => {
      const september = { month: '2026-09', items: [{ ...item(cand('Такси', { amountMinor: sum(300000) }), 'need'), id: 's1' }] };
      const same = cand('Такси домой', { amountMinor: sum(449000) });
      const grown = cand('Такси', { amountMinor: sum(450000) });

      expect(AUDIT_DECISION_RULES.needAgainRatio).toBe(1.5);
      expect(openAuditItems({ month: '2026-10', found: [same], earlier: [september], cancelled: [], newId })).toEqual([]);
      expect(openAuditItems({ month: '2026-10', found: [grown], earlier: [september], cancelled: [], newId }).map(entry => entry.name)).toEqual(['Такси']);
    });

    it('goes by the latest decision: needed in August, extra in September is offered', () => {
      const august = { month: '2026-08', items: [{ ...item(cand('Такси'), 'need'), id: 'a1' }] };
      const september = { month: '2026-09', items: [{ ...item(cand('Такси'), 'extra'), id: 's1' }] };
      expect(openAuditItems({ month: '2026-10', found: [cand('Такси')], earlier: [september, august], cancelled: [], newId })).toHaveLength(1);
    });

    it('offers a needed subscription again only when it is dearer by more than 10%', () => {
      const service = (amount: number) => ({ ...byName('Кинопоиск'), amountMinor: sum(amount), monthlyMinor: sum(amount) });
      const september = { month: '2026-09', items: [{ ...item(service(50000), 'need'), id: 's1' }] };
      expect(openAuditItems({ month: '2026-10', found: [service(55000)], earlier: [september], cancelled: [], newId })).toEqual([]);
      expect(openAuditItems({ month: '2026-10', found: [service(56000)], earlier: [september], cancelled: [], newId })).toHaveLength(1);
    });

    it('does not offer a subscription marked «Уже отменено» unless it was charged after that', () => {
      const charged = (date: string) => ({ ...byName('Кинопоиск'), operations: [{ id: 'k', date, amountMinor: sum(50000) }] });
      const cancelled = [{ serviceKey: 'kinopoisk', cancelledOn: '2026-10-14' }];
      expect(openAuditItems({ month: '2026-10', found: [charged('2026-10-03')], earlier: [], cancelled, newId })).toEqual([]);
      expect(openAuditItems({ month: '2026-10', found: [charged('2026-10-20')], earlier: [], cancelled, newId })).toHaveLength(1);
    });
  });
});
