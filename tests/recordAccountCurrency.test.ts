import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { AccountModule } from '../src/modules/account/accountModule';
import { PeriodTotalsService } from '../src/modules/transaction/application/periodTotalsService';
import { AnalyticsService } from '../src/modules/transaction/application/analyticsService';
import { summarizePeriod } from '../src/modules/transaction/domain/periodTotals';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';

describe('account and currency of every record (FT-103)', () => {
  let db: TestDatabase;
  let records: ReturnType<typeof recordsOn>;
  let openAI: jest.Mocked<Pick<TranscriptionService, 'analyzeInput'>>;
  let capture: ProcessTextInputUseCase;

  beforeEach(async () => {
    db = await openMigratedDatabase();
    records = recordsOn(db.dataSource);
    openAI = { analyzeInput: jest.fn() };
    capture = new ProcessTextInputUseCase(openAI as unknown as TranscriptionService, records.create, undefined, records.catalog);
  });

  afterEach(async () => {
    await db.close();
  });

  async function account(name: string, kind: 'cash' | 'card', currency: 'UZS' | 'USD' = 'UZS') {
    const created = await new AccountModule(records.accountRepository, undefined, records.moveRepository).getCreateAccountUseCase().execute({
      userId: 'user-1', body: { name, kind, currency, openingDate: '2026-10-01' },
    });
    if (!created.success) throw created.error;
    return created.data;
  }

  const stored = async (id: string) => (await records.repository.findById(id))!;

  describe('from text', () => {
    it('«нал» goes to cash, «картой» to the card, an account named in the text to that account', async () => {
      await records.book.listForUser('user-1'); // «Карта», the default
      await account('Наличные', 'cash');
      await account('Humo', 'card');

      const cash = await capture.execute('кофе 25000 нал', 'user-1', undefined, { source: 'telegram' });
      const card = await capture.execute('продукты 186400 картой', 'user-1');
      const humo = await capture.execute('аптека 50000 humo', 'user-1');

      expect(cash.transactions[0]).toMatchObject({ accountName: 'Наличные', currency: 'UZS', amount: 25000, category: 'Кафе' });
      expect(card.transactions[0]).toMatchObject({ accountName: 'Карта' });
      expect(humo.transactions[0]).toMatchObject({ accountName: 'Humo' });
      expect(await stored(cash.transactions[0].id)).toMatchObject({ source: 'telegram', currency: 'UZS' });
      expect(await stored(card.transactions[0].id)).toMatchObject({ source: 'miniapp' });
      expect(cash.transactions[0].assumptions).toContainEqual({ kind: 'account', name: 'Наличные', reason: 'hint' });
      expect(openAI.analyzeInput).not.toHaveBeenCalled();
    });

    it('names the category by its id and the amount in minor units, as the review screen needs them (FT-114)', async () => {
      const result = await capture.execute('кофе 25000', 'user-1');
      const record = await stored(result.transactions[0].id);

      expect(result.transactions[0]).toMatchObject({ categoryId: record.categoryId, category: 'Кафе', amountMinor: 2500000 });
      expect(record.categoryId).toEqual(expect.any(String));
    });

    it('without a word for the account, the default one — and says so, with the guessed category', async () => {
      const result = await capture.execute('кофе 25000', 'user-1');

      expect(result.transactions[0].assumptions).toEqual([
        { kind: 'category', name: 'Кафе' },
        { kind: 'account', name: 'Карта', reason: 'default' },
      ]);
    });

    it('«кофе 45» is 45 000 сум; «кофе 500 сум» and «45к» are as written', async () => {
      const short = await capture.execute('кофе 45', 'user-1');
      const marked = await capture.execute('кофе 500 сум', 'user-1');
      const full = await capture.execute('кофе 45к', 'user-1');

      expect(short.transactions[0]).toMatchObject({ amount: 45000, amountMinor: 4500000 });
      expect(short.transactions[0].assumptions).toContainEqual({ kind: 'thousands', written: '45', amount: 45000 });
      expect(marked.transactions[0].amount).toBe(500);
      expect(full.transactions[0].amount).toBe(45000);
      expect(full.transactions[0].assumptions!.some(a => a.kind === 'thousands')).toBe(false);
    });

    it('«кэшбэк 870» is 870 сум of income on the default account, not cash and not thousands', async () => {
      await account('Наличные', 'cash');

      const result = await capture.execute('кэшбэк 870', 'user-1');

      expect(result.transactions[0]).toMatchObject({ type: 'income', amount: 870, category: 'Кэшбэк', accountName: 'Карта' });
    });

    it('moving own money («перевел 500000 на Humo») stays on the default account', async () => {
      await records.book.listForUser('user-1');
      await account('Humo', 'card');

      const result = await capture.execute('перевел 500000 на Humo', 'user-1');

      expect(result.transactions[0]).toMatchObject({ semanticType: 'own_transfer', accountName: 'Карта' });
    });

    it('«наушники 55$» is 55.00 USD on the dollar account', async () => {
      await account('Доллары', 'cash', 'USD');

      const result = await capture.execute('наушники 55$', 'user-1');

      expect(result.transactions[0]).toMatchObject({ amount: 55, amountMinor: 5500, currency: 'USD', accountName: 'Доллары', needsReview: false });
      expect(await stored(result.transactions[0].id)).toMatchObject({ amountMinor: 5500, currency: 'USD' });
    });

    it('without a dollar account the dollars are kept and the record waits for review', async () => {
      const result = await capture.execute('наушники 55$', 'user-1');
      const record = await stored(result.transactions[0].id);

      expect(record).toMatchObject({ amountMinor: 5500, currency: 'USD', needsReview: true });
      expect(result.transactions[0].assumptions).toContainEqual({ kind: 'currency', currency: 'USD', reason: 'no_usd_account' });

      // It does not count in the сум account's balance until it is moved…
      const [card] = await records.book.listForUser('user-1');
      expect((await records.book.summary('user-1')).accounts[0].balanceMinor).toBe(0);
      // …a сум account cannot take it, a dollar account can
      const refused = await records.update.execute({ id: record.id!, accountId: card.id });
      expect(!refused.success && (refused.error as { statusCode?: number }).statusCode).toBe(400);
      const dollars = await account('Доллары', 'cash', 'USD');
      const moved = await records.update.execute({ id: record.id!, accountId: dollars.id });
      expect(moved.success && moved.data.accountId).toBe(dollars.id);
      const balances = (await records.book.summary('user-1')).accounts;
      expect(balances.find(a => a.id === dollars.id)!.balanceMinor).toBe(-5500);
    });

    it('reports «45» read as 45 000 and a guessed category from the parser', async () => {
      openAI.analyzeInput.mockResolvedValue({
        transactions: [{ intent: 'transaction', amount: 45, category: 'Кафе', type: 'expense', date: '2026-10-16' }],
        debts: [],
      });

      const result = await capture.execute('обедали с коллегами. Вышло 45', 'user-1');

      expect(openAI.analyzeInput).toHaveBeenCalled();
      expect(result.transactions[0].amount).toBe(45000);

      expect(result.transactions[0].assumptions).toEqual(expect.arrayContaining([
        { kind: 'thousands', written: '45', amount: 45000 },
        { kind: 'category', name: 'Кафе' },
      ]));
    });

    it('takes the currency and account the parser gives per item', async () => {
      await account('Наличные', 'cash');
      await account('Доллары', 'cash', 'USD');
      openAI.analyzeInput.mockResolvedValue({
        transactions: [
          { intent: 'transaction', amount: 25000, category: 'Кафе', type: 'expense', date: '2026-10-16', paymentKind: 'cash' },
          { intent: 'transaction', amount: 9.99, category: 'Связь', type: 'expense', date: '2026-10-16', currency: 'USD' },
        ],
        debts: [],
      });

      const result = await capture.execute('кофе 25к налом и подписка 9.99 долларов', 'user-1');

      expect(result.transactions.map(t => [t.accountName, t.currency, t.amountMinor])).toEqual([
        ['Наличные', 'UZS', 2500000],
        ['Доллары', 'USD', 999],
      ]);
    });
  });

  describe('explicit writers', () => {
    it('a picked account brings its currency; a currency the account does not have is refused', async () => {
      const dollars = await account('Доллары', 'cash', 'USD');

      const ok = await records.create.execute({
        userId: 'user-1', accountId: dollars.id, amount: 20, type: 'expense', category: 'Покупки', description: 'x', date: '2026-10-16',
      });
      expect(ok.success && (await stored(ok.data)).currency).toBe('USD');

      const mismatch = await records.create.execute({
        userId: 'user-1', accountId: dollars.id, currency: 'UZS', amount: 20000, type: 'expense', category: 'Покупки', description: 'x', date: '2026-10-16',
      });
      expect(!mismatch.success && (mismatch.error as { statusCode?: number }).statusCode).toBe(400);

      // No account picked, currency USD → the dollar account; and the source of the API is «manual»
      const byCurrency = await records.create.execute({
        userId: 'user-1', currency: 'USD', amount: 5, type: 'expense', category: 'Покупки', description: 'x', date: '2026-10-16',
      });
      expect(byCurrency.success && (await stored(byCurrency.data))).toMatchObject({ accountId: dollars.id, source: 'manual' });
    });

    it('a currency change alone is refused', async () => {
      const created = await records.create.execute({
        userId: 'user-1', amount: 1000, type: 'expense', category: 'Кафе', description: 'x', date: '2026-10-16',
      });
      if (!created.success) throw created.error;

      const result = await records.update.execute({ id: created.data, currency: 'USD' });
      expect(!result.success && (result.error as { statusCode?: number }).statusCode).toBe(400);
    });
  });

  describe('totals in сум', () => {
    const tx = (overrides: Partial<Transaction>): Transaction => ({
      userId: 'user-1', date: '2026-10-16', category: 'Покупки', description: 'x', type: 'expense', semanticType: 'expense',
      amount: 100000, amountMinor: 10000000, currency: 'UZS', ...overrides,
    });
    const usd = tx({ amount: 55, amountMinor: 5500, currency: 'USD' });

    it('converts dollars at the rate, rounded to whole сум, and never adds them as сум', () => {
      const totals = summarizePeriod([tx({}), usd], { usdRateMinor: 1285037 });
      // 100 000 + 55 × 12 850.37 = 706 770.35 → 706 770
      expect(totals.expenseMinor).toBe((100000 + 706770) * 100);
      expect(totals.usd).toEqual({ present: true, missingRate: false, rateMinor: 1285037 });

      const noRate = summarizePeriod([tx({}), usd], { usdRateMinor: null });
      expect(noRate.expenseMinor).toBe(100000 * 100);
      expect(noRate.usd.missingRate).toBe(true);
    });

    it('keeps review, income and own movements apart, and ranks categories', () => {
      const totals = summarizePeriod([
        tx({ category: 'Кафе', amountMinor: 3000000 }),
        tx({ category: 'Покупки', amountMinor: 1000000 }),
        tx({ category: 'Кафе', amountMinor: 1000000, needsReview: true }),
        tx({ type: 'income', semanticType: 'income', category: 'Зарплата', amountMinor: 50000000 }),
        tx({ semanticType: 'own_transfer', amountMinor: 20000000 }),
      ], { usdRateMinor: null });

      expect(totals).toMatchObject({ incomeMinor: 50000000, expenseMinor: 4000000, netMinor: 46000000 });
      expect(totals.categories.map(c => [c.category, c.amountMinor, c.percentage])).toEqual([['Кафе', 3000000, 75], ['Покупки', 1000000, 25]]);
      expect(totals.needsReview).toMatchObject({ count: 1, totalMinor: 1000000 });
      expect(totals.excludedMovements).toEqual({ totalMinor: 20000000, bySemanticType: { own_transfer: 20000000 } });
    });

    it('analytics asks for the user\'s rate when there are dollars', async () => {
      const repository = { findByUserId: jest.fn().mockResolvedValue([tx({}), usd]) };
      const rates = { effectiveUsdRate: jest.fn().mockResolvedValue({ rateMinor: 1290000 }) };
      const analytics = new AnalyticsService(repository as never, new PeriodTotalsService(rates));

      const summary = await analytics.getAnalyticsSummary('user-1');

      expect(summary.totalExpense).toBe(100000 + 709500);
      expect(rates.effectiveUsdRate).toHaveBeenCalledWith('user-1');
    });
  });
});
