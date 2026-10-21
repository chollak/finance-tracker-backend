import { AuditModule } from '../src/modules/audit/auditModule';
import { AuditSources } from '../src/modules/audit/domain/auditSources';
import { GoalRepository } from '../src/modules/audit/domain/auditRepository';
import { AuditCandidateView, AuditView, GoalView } from '../src/modules/audit/application/auditViews';
import { SqliteAuditRepository } from '../src/modules/audit/infrastructure/SqliteAuditRepository';
import { SqliteGoalRepository } from '../src/modules/audit/infrastructure/SqliteGoalRepository';
import { createAuditRoutes, createGoalRoutes } from '../src/modules/audit/presentation/auditController';
import { PeriodTotalsService } from '../src/modules/transaction/application/periodTotalsService';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { createSettingsRoutes } from '../src/modules/user/presentation/controllers/settingsController';
import { Result } from '../src/shared/domain/types/Result';
import { prototypeRecords } from './helpers/auditPrototype';
import { findSchemaDrift } from '../src/shared/infrastructure/database/migrationRunner';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';
import { startTestServer, TestServer } from './helpers/testServer';

const sum = (value: number) => value * 100;
/** 14:00 in Tashkent on 14 October 2026 — the day of the board's audit of September. */
const OCT_14 = new Date('2026-10-14T09:00:00Z');
const NOV_2 = new Date('2026-11-02T09:00:00Z');

const candidate = (audit: AuditView, name: string): AuditCandidateView => audit.candidates.find(entry => entry.name === name)!;
const goalNamed = (goals: GoalView[], name: string): GoalView => goals.find(goal => goal.name === name)!;

function unwrap<T>(result: Result<T>): T {
  if (!result.success) throw result.error;
  return result.data;
}

function statusOf<T>(result: Result<T>): number | undefined {
  return result.success ? 200 : (result.error as { statusCode?: number }).statusCode;
}

/**
 * FT-131: the audit of a month is kept with its candidates and decisions (`audits`), «Готово» turns the extra into
 * goals (`goals`), goals count from the audit day, and what was left undecided goes into the next audit — on the
 * board's data and a real SQLite file.
 */
describe('audit storage and goals (FT-131)', () => {
  let db: TestDatabase;
  let records: ReturnType<typeof recordsOn>;
  let now: Date;
  let sources: AuditSources;
  let audits: AuditModule;

  beforeEach(async () => {
    db = await openMigratedDatabase();
    records = recordsOn(db.dataSource);
    now = OCT_14;
    const periodTotals = new PeriodTotalsService({ effectiveUsdRate: async () => ({ rateMinor: 1265000, source: 'cbu' }) });
    sources = {
      recordsBetween: (userId, from, to) => records.repository.getByUserIdAndDateRange(userId, new Date(from), new Date(to)),
      firstRecordDate: userId => records.repository.findFirstRecordDate(userId),
      categories: userId => records.catalog.listForUser(userId),
      usdRateMinor: (userId, list) => periodTotals.usdRateFor(userId, list),
    };
    audits = new AuditModule({
      audits: new SqliteAuditRepository(db.dataSource),
      goals: new SqliteGoalRepository(db.dataSource),
      sources,
      now: () => now,
    });
  });

  afterEach(async () => {
    await db.close();
  });

  async function record(overrides: Partial<Transaction>, userId = 'user-1') {
    const created = await records.create.execute({
      userId, amount: 28000, type: 'expense', category: 'Кафе', description: 'Кофе', date: '2026-10-10', ...overrides,
    });
    if (!created.success) throw created.error;
    return created.data;
  }

  /** The records of the board «Ревизия трат»: August and September whole, October 1–14. */
  async function seedBoard(userId = 'user-1') {
    for (const row of prototypeRecords()) {
      await record({ amount: row.amountMinor / 100, category: row.categoryName, description: row.note, date: row.date }, userId);
    }
  }

  const current = async (userId = 'user-1') => unwrap(await audits.getCurrentAuditUseCase().execute({ userId }));
  const decide = (auditId: string, candidateId: string, body: Record<string, unknown>, userId = 'user-1') =>
    audits.getDecideAuditCandidateUseCase().execute({ userId, auditId, candidateId, body });
  const finish = (auditId: string, userId = 'user-1') => audits.getFinishAuditUseCase().execute({ userId, auditId });
  const goals = async (userId = 'user-1') => unwrap(await audits.getListGoalsUseCase().execute({ userId }));
  const updateGoal = (goalId: string, body: Record<string, unknown>, userId = 'user-1') =>
    audits.getUpdateGoalUseCase().execute({ userId, goalId, body });

  async function mark(audit: AuditView, marks: Record<string, Record<string, unknown>>): Promise<AuditView> {
    let latest = audit;
    for (const [name, body] of Object.entries(marks)) latest = unwrap(await decide(audit.id!, candidate(audit, name).id, body));
    return latest;
  }

  /** The board's preset «done»: everything extra but «Второй номер», which is needed. */
  const BOARD_MARKS = {
    'Кофе': { decision: 'extra' },
    'Такси': { decision: 'extra' },
    'Доставка еды': { decision: 'extra' },
    'Кинопоиск': { decision: 'extra' },
    'Наушники': { decision: 'extra' },
    'Второй номер': { decision: 'need' },
  };

  it('has no audit before a month was recorded whole, and tells when the first one opens', async () => {
    expect(await current()).toMatchObject({
      state: 'too_early', id: null, month: '2026-09', today: '2026-10-14', firstRecordDate: null, firstAuditOn: null,
      nextAuditOn: '2026-11-01', candidates: [], goals: [],
    });

    await record({ date: '2026-10-02' });
    expect(await current()).toMatchObject({ state: 'too_early', firstRecordDate: '2026-10-02', firstAuditOn: '2026-11-01' });

    // September begun on the 12th is known only in part: the first audit is October's
    await record({ date: '2026-09-12' });
    expect(await current()).toMatchObject({ state: 'too_early', firstRecordDate: '2026-09-12', firstAuditOn: '2026-11-01' });
    expect(await db.dataSource.query('SELECT COUNT(*) AS n FROM audits')).toEqual([{ n: 0 }]);
  });

  it('opens September\'s audit with the candidates of the board', async () => {
    await seedBoard();
    const audit = await current();

    expect(audit).toMatchObject({ state: 'open', month: '2026-09', doneOn: null, nextAuditOn: '2026-11-01', goals: [], comparison: null });
    expect(audit.candidates.map(entry => [entry.name, entry.kind, entry.amountMinor, entry.decision, entry.goal, entry.carriedFrom])).toEqual([
      ['Доставка еды', 'more_often', sum(732000), null, null, null],
      ['Наушники', 'large_purchase', sum(690000), null, null, null],
      ['Кофе', 'frequent_small', sum(448000), null, null, null],
      ['Такси', 'frequent_small', sum(349000), null, null, null],
      ['Второй номер', 'tariff', sum(50000), null, null, null],
      ['Кинопоиск', 'subscription', sum(50000), null, null, null],
    ]);
    expect(audit.summary).toEqual({
      count: 6, marked: 0, left: 6, extraCount: 0, needCount: 0, goalCount: 0, totalMinor: sum(2319000), planMinor: 0, wastedMinor: 0,
      carriedCount: 0, carriedTotalMinor: 0, carriedWastedMinor: 0,
    });
    expect(candidate(audit, 'Такси')).toMatchObject({ halfLimitMinor: sum(175000), savingMinor: 0, monthlyMinor: sum(349000) });
    expect(candidate(audit, 'Такси').title.replace(/ /g, ' ')).toBe('Такси — 13 раз');
    expect(candidate(audit, 'Кинопоиск').halfLimitMinor).toBeNull();
    expect(candidate(audit, 'Наушники').halfLimitMinor).toBeNull();
    expect(await db.dataSource.query('SELECT COUNT(*) AS n FROM audits')).toEqual([{ n: 1 }]);
  });

  it('opens one audit when asked twice at once', async () => {
    await seedBoard();
    const [first, second] = await Promise.all([current(), current()]);
    expect(second.id).toBe(first.id);
    expect(second.candidates.map(entry => entry.id)).toEqual(first.candidates.map(entry => entry.id));
    expect(await db.dataSource.query('SELECT COUNT(*) AS n FROM audits')).toEqual([{ n: 1 }]);
  });

  it('keeps the marks, and «Готово» makes the goals of the board «Ревизия · итог и цели»', async () => {
    await seedBoard();
    const marked = await mark(await current(), BOARD_MARKS);
    expect(marked.summary).toMatchObject({ marked: 6, left: 0, planMinor: sum(814000) });
    expect(marked.state).toBe('open');
    expect(await goals()).toMatchObject({ goals: [], planMinor: 0 });

    const done = unwrap(await finish(marked.id!));

    expect(done).toMatchObject({
      state: 'done',
      doneOn: '2026-10-14',
      summary: { marked: 6, left: 0, extraCount: 5, needCount: 1, goalCount: 4, planMinor: sum(814000), wastedMinor: sum(1504000) },
      comparison: { amountMinor: sum(365400), previousMinor: sum(774000), percent: -53 },
    });
    expect(done.goals.map(goal => [goal.name, goal.kind, goal.limitMinor, goal.periodLimitMinor, goal.spentMinor, goal.savingMinor, goal.comparison?.percent ?? null])).toEqual([
      ['Доставка еды', 'half', sum(366000), sum(213000), 0, sum(366000), -100],
      ['Кофе', 'half', sum(224000), sum(130000), 0, sum(224000), -54],
      ['Такси', 'half', sum(175000), sum(102000), sum(24000), sum(174000), 43],
      ['Кинопоиск', 'cancel', 0, 0, 0, sum(50000), null],
    ]);
    expect(goalNamed(done.goals, 'Такси')).toMatchObject({ startsOn: '2026-10-14', endsOn: '2026-10-31', categoryName: 'Транспорт' });
    expect(goalNamed(done.goals, 'Кинопоиск').subscription).toEqual({
      state: null, lastChargeOn: '2026-10-03', nextChargeOn: '2026-11-03', remindOn: '2026-11-02', chargeMinor: sum(50000),
    });

    // «Цели после ревизии» on Home: 4 цели · экономия до 814 000 сум
    expect(await goals()).toMatchObject({
      today: '2026-10-14', startsOn: '2026-10-14', endsOn: '2026-10-31', planMinor: sum(814000),
      comparison: { amountMinor: sum(365400), previousMinor: sum(774000), percent: -53 },
    });
    expect((await goals()).goals.map(goal => goal.name)).toEqual(['Доставка еды', 'Кофе', 'Такси', 'Кинопоиск']);
  });

  it('opens «Готово» after the first mark only', async () => {
    await seedBoard();
    const audit = await current();
    expect(statusOf(await finish(audit.id!))).toBe(422);
    await mark(audit, { 'Кофе': { decision: 'need' } });
    expect(unwrap(await finish(audit.id!))).toMatchObject({ state: 'done', summary: { marked: 1, left: 5, goalCount: 0, planMinor: 0 }, goals: [] });
  });

  it('takes a mark back with a second press and keeps the chosen goal for when «Лишнее» comes back', async () => {
    await seedBoard();
    const audit = await current();
    let latest = await mark(audit, { 'Кофе': { decision: 'extra', goal: 'drop' } });
    expect(candidate(latest, 'Кофе')).toMatchObject({ decision: 'extra', goalChoice: 'drop', goal: 'drop', savingMinor: sum(448000) });
    latest = await mark(audit, { 'Кофе': { decision: null } });
    expect(candidate(latest, 'Кофе')).toMatchObject({ decision: null, goalChoice: 'drop', goal: null, savingMinor: 0 });
    latest = await mark(audit, { 'Кофе': { decision: 'extra' } });
    expect(candidate(latest, 'Кофе')).toMatchObject({ goal: 'drop' });
  });

  it('changes the goals when the marks change after «Готово», still counting from the audit day', async () => {
    await seedBoard();
    const audit = await mark(await current(), { 'Кофе': { decision: 'extra' }, 'Такси': { decision: 'extra' } });
    unwrap(await finish(audit.id!));
    const coffeeGoalId = goalNamed((await goals()).goals, 'Кофе').id;

    now = new Date('2026-10-20T09:00:00Z');
    let latest = await mark(audit, { 'Кофе': { goal: 'drop' }, 'Такси': { decision: 'need' } });
    expect(latest).toMatchObject({ state: 'done', doneOn: '2026-10-14' });
    expect(latest.goals.map(goal => [goal.name, goal.kind, goal.startsOn])).toEqual([['Кофе', 'drop', '2026-10-14']]);
    expect(latest.goals[0].id).toBe(coffeeGoalId);

    // «Готово» again keeps the audit day
    latest = unwrap(await finish(audit.id!));
    expect(latest.doneOn).toBe('2026-10-14');
    latest = await mark(audit, { 'Кофе': { decision: null } });
    expect(latest.goals).toEqual([]);
    expect(await db.dataSource.query('SELECT COUNT(*) AS n FROM goals')).toEqual([{ n: 0 }]);
  });

  it('remembers «Напомнить» and «Уже отменено» of a subscription to cancel', async () => {
    await seedBoard();
    const audit = await mark(await current(), { 'Кинопоиск': { decision: 'extra' }, 'Кофе': { decision: 'extra' } });
    const done = unwrap(await finish(audit.id!));
    const cinema = goalNamed(done.goals, 'Кинопоиск');

    const reminded = unwrap(await updateGoal(cinema.id, { subscription: 'remind' }));
    expect(reminded.subscription).toEqual({ state: 'remind', lastChargeOn: '2026-10-03', nextChargeOn: '2026-11-03', remindOn: '2026-11-02', chargeMinor: sum(50000) });

    now = new Date('2026-10-20T09:00:00Z');
    expect(goalNamed((await goals()).goals, 'Кинопоиск').subscription).toMatchObject({ state: 'remind', remindOn: '2026-11-02' });

    const cancelled = unwrap(await updateGoal(cinema.id, { subscription: 'cancelled' }));
    expect(cancelled.subscription).toMatchObject({ state: 'cancelled', remindOn: null });
    expect(await db.dataSource.query("SELECT cancelled_on AS day FROM goals WHERE id = ?", [cinema.id])).toEqual([{ day: '2026-10-20' }]);

    expect(unwrap(await updateGoal(cinema.id, { subscription: null })).subscription).toMatchObject({ state: null, remindOn: '2026-11-02' });
    expect(statusOf(await updateGoal(goalNamed(done.goals, 'Кофе').id, { subscription: 'remind' }))).toBe(422);
    expect(statusOf(await updateGoal(cinema.id, { subscription: 'later' }))).toBe(400);
    expect(statusOf(await updateGoal(cinema.id, {}))).toBe(400);
    expect(statusOf(await updateGoal(cinema.id, { subscription: 'remind' }, 'someone-else'))).toBe(404);
  });

  it('brings what was left undecided into the next audit, without what was needed or cancelled', async () => {
    await seedBoard();
    const september = await mark(await current(), {
      'Такси': { decision: 'extra' },
      'Кинопоиск': { decision: 'extra' },
      'Второй номер': { decision: 'need' },
    });
    const done = unwrap(await finish(september.id!));
    unwrap(await updateGoal(goalNamed(done.goals, 'Кинопоиск').id, { subscription: 'cancelled' }));

    // 2 November: October's audit. Its rules find «Кроссовки», «Такси», «Второй номер» and «Кинопоиск»; the second
    // number was needed and costs the same, the cinema was cancelled after its October charge
    now = NOV_2;
    const october = await current();
    expect(october).toMatchObject({ state: 'open', month: '2026-10', nextAuditOn: '2026-12-01', goals: [] });
    expect(october.candidates.map(entry => [entry.name, entry.carriedFrom])).toEqual([
      ['Кроссовки', null],
      ['Такси', null],
      ['Доставка еды', '2026-09'],
      ['Наушники', '2026-09'],
      ['Кофе', '2026-09'],
    ]);
    expect(candidate(october, 'Кофе')).toMatchObject({ amountMinor: sum(448000), reason: expect.stringContaining('В августе') });

    // September's goals are over: Home asks for the new audit
    expect(await goals()).toMatchObject({ goals: [], planMinor: 0, startsOn: null, endsOn: null });

    // Left undecided again, a candidate brought from September does not come a third time
    now = new Date('2026-12-02T09:00:00Z');
    expect((await current()).candidates.map(entry => [entry.name, entry.carriedFrom])).toEqual([
      ['Кроссовки', '2026-10'],
      ['Такси', '2026-10'],
    ]);
  });

  /**
   * FT-142: the follow-ups of FT-131's review the audit screens (FT-132) need — rules in docs/tasks/decisions.md,
   * 2026-10-21 «решения FT-130 и правила по ревью FT-131».
   */
  describe('review follow-ups (FT-142)', () => {
    it('finds the candidates again on every read until the first mark, keeping the ids of the same spending', async () => {
      await seedBoard();
      const audit = await current();

      // Recorded for September after the first read — the invitation on the 1st must not cut off yesterday
      await record({ date: '2026-09-30' });
      await record({ amount: 900000, category: 'Покупки', description: 'Телевизор', date: '2026-09-29' });
      const again = await current();

      expect(again.id).toBe(audit.id);
      expect(again.state).toBe('open');
      expect(candidate(again, 'Кофе')).toMatchObject({ count: 17, amountMinor: sum(476000) });
      expect(candidate(again, 'Телевизор')).toMatchObject({ kind: 'large_purchase', amountMinor: sum(900000), decision: null });
      expect(again.summary).toMatchObject({ count: 7, totalMinor: sum(2319000 + 28000 + 900000) });
      // A screen that read the audit before still marks the same spending
      for (const entry of audit.candidates) expect(candidate(again, entry.name).id).toBe(entry.id);
      expect(await db.dataSource.query('SELECT COUNT(*) AS n FROM audits')).toEqual([{ n: 1 }]);
      expect(unwrap(await decide(audit.id!, candidate(audit, 'Такси').id, { decision: 'extra' })).candidates).toHaveLength(7);
    });

    it('keeps the candidates as they are from the first mark on, even when the mark is taken back', async () => {
      await seedBoard();
      const marked = await mark(await current(), { 'Кофе': { decision: 'need' } });

      await record({ date: '2026-09-30' });
      await record({ amount: 900000, category: 'Покупки', description: 'Телевизор', date: '2026-09-29' });
      const after = await current();
      expect(after.candidates.map(entry => [entry.id, entry.name, entry.amountMinor])).toEqual(
        marked.candidates.map(entry => [entry.id, entry.name, entry.amountMinor]));
      expect(candidate(after, 'Кофе').count).toBe(16);

      await mark(marked, { 'Кофе': { decision: null } });
      await record({ date: '2026-09-29' });
      expect(candidate(await current(), 'Кофе').count).toBe(16);
      expect((await current()).candidates.map(entry => entry.name)).not.toContain('Телевизор');
    });

    it('keeps the candidates as they are after «Готово», also when nothing was found', async () => {
      // Only groceries: not a flexible category, so September has nothing to mark
      await record({ amount: 400000, category: 'Продукты', description: 'Супермаркет', date: '2026-08-01' });
      await record({ amount: 400000, category: 'Продукты', description: 'Супермаркет', date: '2026-09-02' });
      const clean = await current();
      expect(clean).toMatchObject({ state: 'open', candidates: [] });
      expect(unwrap(await finish(clean.id!))).toMatchObject({ state: 'done', doneOn: '2026-10-14', candidates: [] });

      await record({ amount: 900000, category: 'Покупки', description: 'Телевизор', date: '2026-09-29' });
      expect(await current()).toMatchObject({ state: 'done', candidates: [] });
    });

    it('keeps a mark sent while the audit is found again', async () => {
      await seedBoard();
      const audit = await current();
      await record({ date: '2026-09-30' });

      await Promise.all([current(), decide(audit.id!, candidate(audit, 'Такси').id, { decision: 'extra' }), current()]);

      const after = await current();
      expect(candidate(after, 'Такси').decision).toBe('extra');
      expect(candidate(after, 'Такси').id).toBe(candidate(audit, 'Такси').id);
    });

    it('sums only the month audited; what came from the audit before is a number apart', async () => {
      await seedBoard();
      const september = await mark(await current(), {
        'Такси': { decision: 'extra' },
        'Кинопоиск': { decision: 'extra' },
        'Второй номер': { decision: 'need' },
      });
      const done = unwrap(await finish(september.id!));
      unwrap(await updateGoal(goalNamed(done.goals, 'Кинопоиск').id, { subscription: 'cancelled' }));

      now = NOV_2;
      const october = await current();
      const own = october.candidates.filter(entry => entry.carriedFrom === null);
      expect(own.map(entry => entry.name)).toEqual(['Кроссовки', 'Такси']);
      const ownTotal = own.reduce((total, entry) => total + entry.amountMinor, 0);
      expect(october.summary).toMatchObject({
        count: 5,
        left: 5,
        totalMinor: ownTotal,
        wastedMinor: 0,
        // «Доставка еды», «Наушники» and «Кофе» of September
        carriedCount: 3,
        carriedTotalMinor: sum(732000 + 690000 + 448000),
        carriedWastedMinor: 0,
      });

      const marked = await mark(october, {
        'Кроссовки': { decision: 'extra' },
        'Наушники': { decision: 'extra' },
        'Кофе': { decision: 'extra', goal: 'drop' },
      });
      expect(marked.summary).toMatchObject({
        totalMinor: ownTotal,
        // October's extra: the sneakers, a one-off purchase, whole
        wastedMinor: candidate(october, 'Кроссовки').amountMinor,
        // September's extra brought here: the headphones and the coffee given up
        carriedWastedMinor: sum(690000 + 448000),
        planMinor: sum(448000),
      });
    });

    it('tells a subscription to cancel from a paid tariff to turn off (serviceKind)', async () => {
      await seedBoard();
      const audit = await mark(await current(), {
        'Кинопоиск': { decision: 'extra' },
        'Второй номер': { decision: 'extra' },
        'Кофе': { decision: 'extra' },
      });
      const done = unwrap(await finish(audit.id!));

      expect(done.goals.map(goal => [goal.name, goal.kind, goal.serviceKind])).toEqual([
        ['Кофе', 'half', null],
        ['Второй номер', 'cancel', 'tariff'],
        ['Кинопоиск', 'cancel', 'subscription'],
      ]);
      expect((await goals()).goals.map(goal => [goal.name, goal.serviceKind])).toEqual([
        ['Кофе', null],
        ['Второй номер', 'tariff'],
        ['Кинопоиск', 'subscription'],
      ]);
      const answered = unwrap(await updateGoal(goalNamed(done.goals, 'Второй номер').id, { subscription: 'cancelled' }));
      expect(answered).toMatchObject({ serviceKind: 'tariff', subscription: { state: 'cancelled' } });
    });

    it('makes no goal for a spending marked «Нужно» while the goals were being written', async () => {
      await seedBoard();
      const auditRepository = new SqliteAuditRepository(db.dataSource);
      const goalRepository = new SqliteGoalRepository(db.dataSource);
      /** Runs once, when the goals' sync has read the audit and is about to write the goals. */
      let meanwhile: (() => Promise<void>) | null = null;
      const watched: GoalRepository = {
        createIgnoringDuplicate: goal => goalRepository.createIgnoringDuplicate(goal),
        findById: id => goalRepository.findById(id),
        findByAuditId: async auditId => {
          const found = await goalRepository.findByAuditId(auditId);
          const run = meanwhile;
          meanwhile = null;
          if (run) await run();
          return found;
        },
        findByUserId: userId => goalRepository.findByUserId(userId),
        update: (id, changes) => goalRepository.update(id, changes),
        delete: id => goalRepository.delete(id),
      };
      const module = new AuditModule({ audits: auditRepository, goals: watched, sources, now: () => now });

      const audit = await mark(await current(), { 'Такси': { decision: 'extra' }, 'Кофе': { decision: 'extra' } });
      const taxiId = candidate(audit, 'Такси').id;
      let ran = false;
      // «Нужно» on «Такси» lands between the sync's read of the audit and its writes; its own sync has not run yet
      meanwhile = async () => {
        ran = true;
        const stored = (await auditRepository.findById(audit.id!))!;
        const items = stored.items.map(entry => (entry.id === taxiId ? { ...entry, decision: 'need' as const } : entry));
        expect(await auditRepository.updateIfVersion(stored.id, stored.version, { items, doneOn: stored.doneOn, frozen: true })).toBe(true);
      };

      const done = unwrap(await module.getFinishAuditUseCase().execute({ userId: 'user-1', auditId: audit.id! }));

      expect(ran).toBe(true);
      expect(done.goals.map(goal => goal.name)).toEqual(['Кофе']);
      const after = await current();
      expect(candidate(after, 'Такси').decision).toBe('need');
      expect(after.goals.map(goal => goal.name)).toEqual(['Кофе']);
      expect(await db.dataSource.query('SELECT name FROM goals')).toEqual([{ name: 'Кофе' }]);
    });

    it('freezes, by migration, the audits kept before that have a mark, a chosen goal or an audit day', async () => {
      const ds = db.dataSource;
      for (;;) {
        const [last] = await ds.query(`SELECT "name" FROM "migrations" ORDER BY "id" DESC LIMIT 1`);
        await ds.undoLastMigration({ transaction: 'each' });
        if (!last || last.name === 'AuditFrozen1762300000000') break;
      }
      const itemOf = (fields: Record<string, unknown>) => JSON.stringify([{ id: 'c1', name: 'Кофе', categoryId: 'cat', amountMinor: 100, operations: [], carriedFrom: null, decision: null, goalChoice: null, ...fields }]);
      const insert = (id: string, month: string, candidates: string, doneOn: string | null) =>
        ds.query(`INSERT INTO "audits" ("id", "user_id", "month", "candidates", "done_on") VALUES (?, 'user-1', ?, ?, ?)`, [id, month, candidates, doneOn]);
      await insert('untouched', '2026-06', itemOf({}), null);
      await insert('marked', '2026-07', itemOf({ decision: 'need' }), null);
      await insert('chosen', '2026-08', itemOf({ goalChoice: 'drop' }), null);
      await insert('done', '2026-09', '[]', '2026-10-14');

      await ds.runMigrations({ transaction: 'each' });

      expect(await ds.query(`SELECT "id", "frozen" FROM "audits" ORDER BY "month"`)).toEqual([
        { id: 'untouched', frozen: 0 },
        { id: 'marked', frozen: 1 },
        { id: 'chosen', frozen: 1 },
        { id: 'done', frozen: 1 },
      ]);
      expect(await findSchemaDrift(ds)).toEqual([]);
    });

    it('ends with the goals of the last marks when marks and «Готово» come at once', async () => {
      await seedBoard();
      const audit = await mark(await current(), { 'Такси': { decision: 'extra' }, 'Кофе': { decision: 'extra' } });

      await Promise.all([
        finish(audit.id!),
        decide(audit.id!, candidate(audit, 'Такси').id, { decision: 'need' }),
        decide(audit.id!, candidate(audit, 'Доставка еды').id, { decision: 'extra' }),
        decide(audit.id!, candidate(audit, 'Кофе').id, { goal: 'drop' }),
      ]);

      const after = await current();
      expect(after.goals.map(goal => [goal.name, goal.kind])).toEqual([['Доставка еды', 'half'], ['Кофе', 'drop']]);
      expect(await db.dataSource.query('SELECT name, kind FROM goals ORDER BY name')).toEqual([
        { name: 'Доставка еды', kind: 'half' },
        { name: 'Кофе', kind: 'drop' },
      ]);
    });
  });

  describe('routes', () => {
    let server: TestServer;

    beforeEach(async () => {
      const userModule = new UserModule(new SqliteUserRepository(db.dataSource), new SqliteUserSettingsRepository(db.dataSource));
      server = await startTestServer({
        '/audits': createAuditRoutes(audits, userModule),
        '/goals': createGoalRoutes(audits, userModule),
        '/settings': createSettingsRoutes(userModule),
      });
    });

    afterEach(async () => {
      await server.close();
    });

    it('serve the current user\'s audit and goals and no one else\'s', async () => {
      const userId = (await server.request('GET', '/api/settings', { devUser: 4242 })).body.data.userId;
      await seedBoard(userId);

      const opened = await server.request('GET', '/api/audits/current', { devUser: 4242 });
      expect(opened.status).toBe(200);
      expect(opened.body.data).toMatchObject({ state: 'open', month: '2026-09' });
      const audit = opened.body.data as AuditView;
      const path = (name: string) => `/api/audits/${audit.id}/candidates/${candidate(audit, name).id}`;

      const marked = await server.request('PATCH', path('Кофе'), { devUser: 4242, body: { decision: 'extra' } });
      expect(marked.status).toBe(200);
      expect(candidate(marked.body.data, 'Кофе')).toMatchObject({ decision: 'extra', goal: 'half' });
      expect((await server.request('PATCH', path('Кофе'), { devUser: 4242, body: { decision: 'maybe' } })).status).toBe(400);
      expect((await server.request('PATCH', path('Кофе'), { devUser: 4242, body: { goal: 'quarter' } })).status).toBe(400);
      expect((await server.request('PATCH', path('Кофе'), { devUser: 4242, body: {} })).status).toBe(400);
      expect((await server.request('PATCH', path('Кинопоиск'), { devUser: 4242, body: { goal: 'half' } })).status).toBe(422);
      expect((await server.request('PATCH', path('Наушники'), { devUser: 4242, body: { goal: 'drop' } })).status).toBe(422);
      expect((await server.request('PATCH', `/api/audits/${audit.id}/candidates/nope`, { devUser: 4242, body: { decision: 'need' } })).status).toBe(404);

      const finished = await server.request('POST', `/api/audits/${audit.id}/finish`, { devUser: 4242 });
      expect(finished.status).toBe(200);
      expect(finished.body.data).toMatchObject({ state: 'done', doneOn: '2026-10-14' });

      const listed = await server.request('GET', '/api/goals', { devUser: 4242 });
      expect(listed.status).toBe(200);
      expect(listed.body.data.goals.map((goal: GoalView) => [goal.name, goal.kind])).toEqual([['Кофе', 'half']]);
      const coffeeGoal = listed.body.data.goals[0] as GoalView;
      expect((await server.request('PATCH', `/api/goals/${coffeeGoal.id}`, { devUser: 4242, body: { subscription: 'remind' } })).status).toBe(422);

      // Someone else sees neither the audit nor the goals
      expect((await server.request('GET', '/api/audits/current', { devUser: 5151 })).body.data).toMatchObject({ state: 'too_early', id: null });
      expect((await server.request('PATCH', path('Кофе'), { devUser: 5151, body: { decision: 'need' } })).status).toBe(404);
      expect((await server.request('POST', `/api/audits/${audit.id}/finish`, { devUser: 5151 })).status).toBe(404);
      expect((await server.request('GET', '/api/goals', { devUser: 5151 })).body.data.goals).toEqual([]);
      expect((await server.request('PATCH', `/api/goals/${coffeeGoal.id}`, { devUser: 5151, body: { subscription: null } })).status).toBe(404);

      expect((await server.request('GET', '/api/audits/current')).status).toBe(401);
      expect((await server.request('GET', '/api/goals')).status).toBe(401);
    });

    it('close an audit once its month is no longer the one audited', async () => {
      const userId = (await server.request('GET', '/api/settings', { devUser: 4242 })).body.data.userId;
      await seedBoard(userId);
      const audit = (await server.request('GET', '/api/audits/current', { devUser: 4242 })).body.data as AuditView;

      now = NOV_2;
      const late = await server.request('PATCH', `/api/audits/${audit.id}/candidates/${candidate(audit, 'Кофе').id}`, { devUser: 4242, body: { decision: 'need' } });
      expect(late.status).toBe(409);
      expect((await server.request('POST', `/api/audits/${audit.id}/finish`, { devUser: 4242 })).status).toBe(409);
    });

    it('keep every mark of taps sent at once', async () => {
      const userId = (await server.request('GET', '/api/settings', { devUser: 4242 })).body.data.userId;
      await seedBoard(userId);
      const audit = (await server.request('GET', '/api/audits/current', { devUser: 4242 })).body.data as AuditView;

      const answers = await Promise.all(audit.candidates.map(entry =>
        server.request('PATCH', `/api/audits/${audit.id}/candidates/${entry.id}`, { devUser: 4242, body: { decision: 'need' } })));
      expect(answers.map(answer => answer.status)).toEqual(audit.candidates.map(() => 200));

      const after = (await server.request('GET', '/api/audits/current', { devUser: 4242 })).body.data as AuditView;
      expect(after.candidates.map(entry => entry.decision)).toEqual(audit.candidates.map(() => 'need'));
    });
  });
});
