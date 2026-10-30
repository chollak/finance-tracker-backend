import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import { randomUUID } from 'crypto';
import { createTransactionRouter } from '../src/modules/transaction/presentation/controllers/transactionController';
import { errorHandler } from '../src/delivery/web/express/middleware/errorMiddleware';
import { UpdateTransactionUseCase } from '../src/modules/transaction/application/updateTransaction';
import { GetTransactionByIdUseCase } from '../src/modules/transaction/application/getTransactionById';
import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { RecordPaymentUseCase } from '../src/modules/voiceProcessing/application/recordPayment';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { CreateCategoryUseCase, UpdateCategoryUseCase } from '../src/modules/category/application/categoryUseCases';
import { SqliteCategoryRepository } from '../src/modules/category/infrastructure/SqliteCategoryRepository';
import { TransactionLearningService } from '../src/shared/application/learning/transactionLearning';
import { UserModule } from '../src/modules/user/userModule';
import { AccountModule } from '../src/modules/account/accountModule';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';
import { listenOnLoopback, LoopbackServer } from './helpers/testServer';

/**
 * FT-184: the Mini App changes a record's category with `PUT /api/transactions/:id { categoryId }` alone. The server
 * takes what the record was made from — the phrase, a payment's merchant — from the stored record, so the correction
 * teaches the parser. A payment teaches its whole merchant: the next payment there needs no AI. A phrase teaches the
 * words of it that can name a category, counted per word: after one lesson the word gives its category as a guess,
 * from two for sure.
 */
const TELEGRAM_ID = '131184740';
const USER = 'owner-uuid-ft184';
const users = {
  getGetOrCreateUserUseCase: () => ({ execute: jest.fn().mockResolvedValue({ id: USER }) }),
  getGetUserUseCase: () => ({ execute: jest.fn().mockResolvedValue({ success: true, data: { id: USER } }) }),
} as unknown as UserModule;
const unused = { execute: jest.fn() } as never;

describe('a category correction teaches (FT-184)', () => {
  let db: TestDatabase;
  let records: ReturnType<typeof recordsOn>;
  let dir: string;
  let learning: TransactionLearningService;
  let openAI: { analyzeInput: jest.Mock; categoryOfMerchant: jest.Mock; transcribe: jest.Mock };
  let phrases: ProcessTextInputUseCase;
  let payments: RecordPaymentUseCase;
  let api: LoopbackServer;

  beforeEach(async () => {
    db = await openMigratedDatabase();
    records = recordsOn(db.dataSource);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft184-learning-'));
    fs.mkdirSync(path.join(dir, 'data'));
    learning = new TransactionLearningService(dir);
    openAI = { analyzeInput: jest.fn(), categoryOfMerchant: jest.fn().mockResolvedValue('Покупки'), transcribe: jest.fn() };
    const parser = openAI as unknown as TranscriptionService;
    phrases = new ProcessTextInputUseCase(parser, records.create, undefined, records.catalog, learning);
    payments = new RecordPaymentUseCase(parser, records.create, records.catalog, learning);

    const app = express();
    app.use(express.json());
    app.use('/api/transactions', createTransactionRouter(
      unused, unused, unused, unused,
      new GetTransactionByIdUseCase(records.repository),
      unused,
      new UpdateTransactionUseCase(records.repository, records.catalog, records.book, learning),
      unused,
      unused, unused, unused, unused, unused,
      undefined,
      users
    ));
    app.use(errorHandler);
    api = await listenOnLoopback(app);
  });

  afterEach(async () => {
    await api.close();
    await db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** The AI's reading of a phrase: one record per item. */
  const aiReads = (...items: Array<{ category: string; amount: number; description: string; merchant?: string }>) =>
    openAI.analyzeInput.mockResolvedValueOnce({
      transactions: items.map(item => ({ intent: 'transaction', type: 'expense', date: '2026-10-30', ...item })),
      debts: [],
    });

  const say = async (phrase: string) => (await phrases.execute(phrase, USER, undefined, { clientId: randomUUID() })).transactions;

  const pay = async (merchant: string | undefined) => {
    const paid = await payments.execute({
      userId: USER, amountMinor: 2_500_000, currency: 'UZS', merchant, clientId: randomUUID(), date: '2026-10-30',
    });
    if (!paid.success) throw paid.error;
    return paid.data;
  };

  const categoryId = async (name: string) =>
    (await records.catalog.listForUser(USER)).find(category => category.name === name && category.type === 'expense')!.id;

  /** Exactly what the Mini App sends: the new category and nothing else. */
  const moveTo = async (recordId: string, name: string) => {
    const response = await fetch(`${api.baseUrl}/api/transactions/${recordId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Dev-User-Id': TELEGRAM_ID },
      body: JSON.stringify({ categoryId: await categoryId(name) }),
    });
    expect(response.status).toBe(200);
  };

  const learnedFor = async (key: string) => (await learning.learnedCategoryWords()).get(key) ?? [];

  /** The words corrections counted for a category, with their counts. */
  const lessonsOf = (key: string): Record<string, number> => {
    const file = path.join(dir, 'data', 'patterns.json');
    if (!fs.existsSync(file)) return {};
    const words: Array<{ word: string; category: string; uses: number }> = JSON.parse(fs.readFileSync(file, 'utf-8')).words ?? [];
    return Object.fromEntries(words.filter(entry => entry.category === key).map(entry => [entry.word, entry.uses]));
  };
  const merchantCategory = async (key: string) => (await learning.learnedMerchants()).get(key);
  const guess = (record: { assumptions?: Array<{ kind: string }> }) => record.assumptions?.find(assumption => assumption.kind === 'category');

  const changeCategory = async (name: string, body: Record<string, unknown>) =>
    new UpdateCategoryUseCase(records.catalog, new SqliteCategoryRepository(db.dataSource))
      .execute({ userId: USER, categoryId: await categoryId(name), body });

  it('a phrase record corrected with PUT { categoryId } teaches its words: the next phrase there needs no AI', async () => {
    // Two records written before either is corrected: a word gives its category for sure from its second lesson
    const written = [];
    for (const amount of [50_000, 70_000]) {
      aiReads({ category: 'Покупки', amount, description: 'ZZQX' });
      written.push((await say(`zzqx ${amount}`))[0]);
    }
    for (const record of written) await moveTo(record.id, 'Продукты');

    expect(await learnedFor('groceries')).toContain('zzqx');
    openAI.analyzeInput.mockClear();
    const [next] = await say('zzqx 30000');
    expect(next.category).toBe('Продукты');
    expect(guess(next)).toBeUndefined();
    expect(openAI.analyzeInput).not.toHaveBeenCalled();
  });

  it('after one correction the next phrase there gets the category as a guess, «Продукты?», without the AI', async () => {
    aiReads({ category: 'Покупки', amount: 50_000, description: 'ZZQX' });
    await moveTo((await say('zzqx 50000'))[0].id, 'Продукты');

    openAI.analyzeInput.mockClear();
    const [next] = await say('zzqx 30000');

    expect(next.category).toBe('Продукты');
    expect(guess(next)).toEqual({ kind: 'category', name: 'Продукты' });
    expect(openAI.analyzeInput).not.toHaveBeenCalled();
  });

  it('a phrase teaches no way to pay, city, number or account name: «kkwq paynet uzcard tashkent капитал 50000»', async () => {
    await new AccountModule(records.accountRepository, undefined, records.moveRepository).getCreateAccountUseCase().execute({
      userId: USER, body: { name: 'Капитал', kind: 'card', currency: 'UZS', openingDate: '2026-10-01' },
    });
    aiReads({ category: 'Покупки', amount: 50_000, description: 'KKWQ' });

    await moveTo((await say('kkwq paynet uzcard tashkent капитал 50000'))[0].id, 'Кафе');

    expect(lessonsOf('cafe')).toEqual({ kkwq: 1 });
  });

  it('two Apple Pay payments «ZZQX 77/78» corrected to «Продукты»: the third «ZZQX» payment is «Продукты» without the AI', async () => {
    const paid = [await pay('ZZQX 77'), await pay('ZZQX 78')];
    expect(paid.map(payment => payment.category)).toEqual(['Покупки', 'Покупки']);
    for (const payment of paid) await moveTo(payment.id, 'Продукты');

    openAI.categoryOfMerchant.mockClear();
    const third = await pay('ZZQX 79');
    expect(third.category).toBe('Продукты');
    expect(third.assumptions).not.toContainEqual(expect.objectContaining({ kind: 'category' }));
    expect(openAI.categoryOfMerchant).not.toHaveBeenCalled();
  });

  it('one correction of «KKWQ PAYNET UZCARD» to «Кафе»: the same merchant needs no AI, «PAYNET MOBILE» still asks it', async () => {
    await moveTo((await pay('KKWQ PAYNET UZCARD')).id, 'Кафе');
    openAI.categoryOfMerchant.mockClear();

    const same = await pay('KKWQ PAYNET UZCARD');
    const other = await pay('PAYNET MOBILE');

    expect(same.category).toBe('Кафе');
    expect(guess(same)).toBeUndefined();
    expect(other.category).toBe('Покупки');
    expect(guess(other)).toEqual({ kind: 'category', name: 'Покупки' });
    expect(openAI.categoryOfMerchant.mock.calls.map(([merchant]) => merchant)).toEqual(['PAYNET MOBILE']);
  });

  it('a record made by hand, without a phrase, is changed and teaches nothing', async () => {
    const created = await records.create.execute({
      userId: USER, amount: 25_000, category: 'Покупки', type: 'expense', description: 'ZZQX', date: '2026-10-30',
    });
    if (!created.success) throw created.error;

    await moveTo(created.data, 'Продукты');
    await moveTo(created.data, 'Кафе');

    expect((await records.repository.findById(created.data))!.category).toBe('Кафе');
    expect(fs.existsSync(path.join(dir, 'data', 'patterns.json'))).toBe(false);
  });

  it('a payment without a merchant teaches nothing: «Оплата Apple Pay» is the server’s note, not words of the payment', async () => {
    for (let paid = 0; paid < 2; paid += 1) await moveTo((await pay(undefined)).id, 'Продукты');

    expect(fs.existsSync(path.join(dir, 'data', 'patterns.json'))).toBe(false);
  });

  it('a payment written before, with «Оплата Apple Pay» as its text and no merchant, teaches nothing', async () => {
    const created = await records.create.execute({
      userId: USER, amount: 25_000, category: 'Покупки', type: 'expense', description: 'Оплата Apple Pay', date: '2026-10-30',
      source: 'apple_pay', originalText: 'Оплата Apple Pay',
      originalParsing: { amount: 25_000, category: 'Покупки', type: 'expense' },
    });
    if (!created.success) throw created.error;

    await moveTo(created.data, 'Продукты');

    expect(fs.existsSync(path.join(dir, 'data', 'patterns.json'))).toBe(false);
  });

  it('a correction into the user’s own category teaches nothing: learned words name starter categories only', async () => {
    const own = await new CreateCategoryUseCase(records.catalog, new SqliteCategoryRepository(db.dataSource))
      .execute({ userId: USER, body: { type: 'expense', name: 'Хобби', color: 'peach' } });
    expect(own.success).toBe(true);

    for (const merchant of ['ZZQX 77', 'ZZQX 78']) await moveTo((await pay(merchant)).id, 'Хобби');

    expect(fs.existsSync(path.join(dir, 'data', 'patterns.json'))).toBe(false);
    openAI.categoryOfMerchant.mockClear();
    await pay('ZZQX 79');
    expect(openAI.categoryOfMerchant).toHaveBeenCalledTimes(1);
  });

  it('«Отменить» after a correction — back to the category the record was given — takes the lesson back', async () => {
    const paid = [await pay('ZZQX 77'), await pay('ZZQX 78')];
    for (const record of paid) await moveTo(record.id, 'Продукты');
    expect(await merchantCategory('zzqx')).toBe('groceries');
    for (const record of paid) await moveTo(record.id, 'Покупки');

    expect(await merchantCategory('zzqx')).toBeUndefined();
    openAI.categoryOfMerchant.mockClear();
    await pay('ZZQX 79');
    expect(openAI.categoryOfMerchant).toHaveBeenCalledTimes(1);
  });

  it('a record corrected twice teaches only the category it ends in', async () => {
    for (const merchant of ['ZZQX 77', 'ZZQX 78']) {
      const payment = await pay(merchant);
      await moveTo(payment.id, 'Продукты');
      await moveTo(payment.id, 'Кафе');
    }

    expect(await merchantCategory('zzqx')).toBe('cafe');
  });

  it('a record moved on into the user’s own category takes its lesson back', async () => {
    const own = await new CreateCategoryUseCase(records.catalog, new SqliteCategoryRepository(db.dataSource))
      .execute({ userId: USER, body: { type: 'expense', name: 'Хобби', color: 'peach' } });
    expect(own.success).toBe(true);
    const payment = await pay('ZZQX 77');

    await moveTo(payment.id, 'Продукты');
    await moveTo(payment.id, 'Хобби');

    expect(await merchantCategory('zzqx')).toBeUndefined();
  });

  it('«Отменить» back to a starter renamed since the record was written only takes the lesson back', async () => {
    aiReads({ category: 'Дом', amount: 50_000, description: 'ZZQX' });
    const [record] = await say('zzqx 50000');
    expect((await changeCategory('Дом', { name: 'Квартира' })).success).toBe(true);

    await moveTo(record.id, 'Покупки');
    expect(lessonsOf('shopping')).toEqual({ zzqx: 1 });
    await moveTo(record.id, 'Квартира');

    expect(lessonsOf('shopping')).toEqual({});
    expect(lessonsOf('home')).toEqual({});
  });

  it('«Отменить» back to «Другое» of a record the AI named a hidden starter for teaches «Другое» nothing', async () => {
    expect((await changeCategory('Дом', { isHidden: true })).success).toBe(true);
    aiReads({ category: 'Дом', amount: 50_000, description: 'ZZQX' });
    const [record] = await say('zzqx 50000');
    expect(record.category).toBe('Другое');

    await moveTo(record.id, 'Покупки');
    await moveTo(record.id, 'Другое');

    expect(lessonsOf('other')).toEqual({});
    expect(lessonsOf('shopping')).toEqual({});
  });

  it('an edit of the amount, the day or the note of a phrase record teaches nothing', async () => {
    aiReads({ category: 'Покупки', amount: 50_000, description: 'ZZQX' });
    const [record] = await say('zzqx 50000');

    for (const body of [{ amountMinor: 6_000_000 }, { date: '2026-10-29' }, { description: 'ZZQX маркет' }]) {
      const response = await fetch(`${api.baseUrl}/api/transactions/${record.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Dev-User-Id': TELEGRAM_ID },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(200);
    }

    expect(fs.existsSync(path.join(dir, 'data', 'patterns.json'))).toBe(false);
  });

  it('the amount of a phrase is not a word of its lesson', async () => {
    aiReads({ category: 'Покупки', amount: 50_000, description: 'ZZQX' });
    const [record] = await say('zzqx 50000');

    await moveTo(record.id, 'Продукты');

    expect(lessonsOf('groceries')).toEqual({ zzqx: 1 });
  });

  it('in a phrase of several records a correction teaches only the corrected record’s words', async () => {
    for (const amount of [50_000, 70_000]) {
      aiReads(
        { category: 'Покупки', amount, description: 'ZZQX' },
        { category: 'Покупки', amount: 30_000, description: 'WWPT' }
      );
      const [zzqx] = await say(`zzqx ${amount} и wwpt 30000`);
      await moveTo(zzqx.id, 'Продукты');
    }

    expect(lessonsOf('groceries')).toEqual({ zzqx: 2 });
  });
});
