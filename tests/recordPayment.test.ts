import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { RecordPaymentUseCase } from '../src/modules/voiceProcessing/application/recordPayment';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { OpenAITranscriptionService } from '../src/modules/voiceProcessing/infrastructure/openAITranscriptionService';
import { QuickCaptureService } from '../src/modules/quickCapture/application/quickCaptureService';
import { PaymentCaptureRequest } from '../src/modules/quickCapture/domain/quickCaptureTypes';
import { AccountModule } from '../src/modules/account/accountModule';
import { TransactionLearningService } from '../src/shared/application/learning/transactionLearning';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';

/**
 * FT-176: a payment from Apple Pay comes ready — amount, currency, merchant, the account of its card — and is written as
 * it came. Only the category is chosen: by the merchant's words, else by the AI, else «Другое» with a «?».
 */
const USER = 'user-1';
// The server's clock: Thursday 2026-10-29, 17:00 in Tashkent
const NOW = new Date('2026-10-29T12:00:00.000Z');

describe('a payment from Apple Pay (FT-176)', () => {
  let db: TestDatabase;
  let records: ReturnType<typeof recordsOn>;
  let openAI: { analyzeInput: jest.Mock; categoryOfMerchant: jest.Mock };
  let learnedWords: Map<string, string[]>;
  let service: QuickCaptureService;

  beforeEach(async () => {
    db = await openMigratedDatabase();
    records = recordsOn(db.dataSource);
    openAI = { analyzeInput: jest.fn(), categoryOfMerchant: jest.fn().mockResolvedValue('Продукты') };
    learnedWords = new Map();
    service = serviceWith({ learnedCategoryWords: async () => learnedWords });
  });

  afterEach(async () => {
    await db.close();
  });

  function serviceWith(learned: { learnedCategoryWords(): Promise<ReadonlyMap<string, readonly string[]>> }) {
    const parser = openAI as unknown as TranscriptionService;
    const pipeline = new ProcessTextInputUseCase(parser, records.create, undefined, records.catalog);
    const payments = new RecordPaymentUseCase(parser, records.create, records.catalog, learned);
    return new QuickCaptureService(pipeline, records.repository, () => NOW, payments);
  }

  const pay = (extra: Partial<PaymentCaptureRequest> = {}) =>
    service.capturePayment({ userId: USER, amountMinor: 2_500_000, currency: 'UZS', merchant: 'KORZINKA 24', clientId: randomUUID(), ...extra });

  async function account(name: string, currency: 'UZS' | 'USD' = 'UZS') {
    await records.book.listForUser(USER); // «Карта», the default
    const created = await new AccountModule(records.accountRepository, undefined, records.moveRepository).getCreateAccountUseCase().execute({
      userId: USER, body: { name, kind: 'card', currency, openingDate: '2026-10-01' },
    });
    if (!created.success) throw created.error;
    return created.data;
  }

  const stored = async (id: string) => (await records.repository.findById(id))!;
  const storedCount = async () => (await db.dataSource.query('SELECT COUNT(*) AS n FROM transactions'))[0].n;

  describe('the amount', () => {
    it('is written as it came: 500 сум is 500, not 500 000 as «500» in a phrase', async () => {
      const result = await pay({ amountMinor: 50_000, merchant: 'EVOS' });
      const [record] = result.transactions;

      expect(record).toMatchObject({ amount: 500, amountMinor: 50_000, currency: 'UZS' });
      expect(record.assumptions).not.toContainEqual(expect.objectContaining({ kind: 'thousands' }));
      expect(await stored(record.id)).toMatchObject({ amountMinor: 50_000, currency: 'UZS' });
    });

    it('4.50 USD is 4.50 dollars, on the dollar account of the card', async () => {
      const visa = await account('Visa', 'USD');

      const result = await pay({ amountMinor: 450, currency: 'USD', merchant: 'APPLE.COM/BILL', accountName: 'Visa' });

      expect(result.transactions[0]).toMatchObject({ amount: 4.5, amountMinor: 450, currency: 'USD', accountId: visa.id });
      expect(await stored(result.transactions[0].id)).toMatchObject({ amountMinor: 450, currency: 'USD', accountId: visa.id });
    });

    it('a merchant with digits does not change the amount', async () => {
      const result = await pay({ amountMinor: 1_850_000, merchant: 'KORZINKA 24' });

      expect(result.transactions[0]).toMatchObject({ amount: 18_500, amountMinor: 1_850_000 });
    });
  });

  describe('the record', () => {
    it('keeps the merchant as merchant and note, with the source apple_pay and the day of the server', async () => {
      const result = await pay({ merchant: 'KORZINKA 24' });
      const record = await stored(result.transactions[0].id);

      expect(record).toMatchObject({
        merchant: 'KORZINKA 24', description: 'KORZINKA 24', source: 'apple_pay', type: 'expense', semanticType: 'expense',
        date: '2026-10-29', originalText: 'KORZINKA 24',
      });
      expect(result).toMatchObject({ text: 'KORZINKA 24', source: 'apple_pay' });
      expect(openAI.analyzeInput).not.toHaveBeenCalled();
    });

    it('is dated by the day of the payment on the phone', async () => {
      const result = await pay({ capturedAt: new Date('2026-10-27T21:30:00+05:00') });

      expect(result.transactions[0].date).toBe('2026-10-27');
    });

    it('older than 30 days is refused and nothing is written', async () => {
      const refused = await pay({ capturedAt: new Date('2026-09-01T12:00:00.000Z') }).catch((error: unknown) => error);

      expect(refused).toMatchObject({ code: 'VALIDATION_ERROR', field: 'capturedAt' });
      expect(await storedCount()).toBe(0);
      expect(openAI.categoryOfMerchant).not.toHaveBeenCalled();
    });

    it('without a merchant goes to «Другое ?» without the AI, with a note that says where it came from', async () => {
      const result = await pay({ merchant: undefined });

      expect(result.transactions[0]).toMatchObject({ category: 'Другое', description: 'Оплата Apple Pay' });
      expect(result.transactions[0].assumptions).toContainEqual({ kind: 'category', name: 'Другое' });
      expect(result.text).toBe('');
      expect(openAI.categoryOfMerchant).not.toHaveBeenCalled();
    });
  });

  describe('the category by the merchant', () => {
    it('named by the dictionary needs no AI and is not a guess: «EVOS» is «Кафе»', async () => {
      const result = await pay({ merchant: 'EVOS CHILONZOR' });

      expect(result.transactions[0].category).toBe('Кафе');
      expect(result.transactions[0].assumptions).not.toContainEqual(expect.objectContaining({ kind: 'category' }));
      expect(openAI.categoryOfMerchant).not.toHaveBeenCalled();
    });

    it('of a merchant learned from corrections needs no AI', async () => {
      learnedWords.set('groceries', ['korzinka']);

      const result = await pay({ merchant: 'KORZINKA 24' });

      expect(result.transactions[0].category).toBe('Продукты');
      expect(result.transactions[0].assumptions).not.toContainEqual(expect.objectContaining({ kind: 'category' }));
      expect(openAI.categoryOfMerchant).not.toHaveBeenCalled();
    });

    it('of an unknown merchant is the AI’s choice of the category alone, shown as a guess', async () => {
      const result = await pay({ merchant: 'KORZINKA 24', amountMinor: 1_850_000 });

      expect(openAI.categoryOfMerchant).toHaveBeenCalledWith('KORZINKA 24', expect.objectContaining({
        categories: expect.arrayContaining([expect.objectContaining({ name: 'Продукты', type: 'expense' })]),
      }));
      expect(openAI.analyzeInput).not.toHaveBeenCalled();
      expect(result.transactions[0]).toMatchObject({ category: 'Продукты', amount: 18_500, date: '2026-10-29' });
      expect(result.transactions[0].assumptions).toContainEqual({ kind: 'category', name: 'Продукты' });
    });

    it('is «Другое ?» when the AI cannot answer, and the payment is still written', async () => {
      openAI.categoryOfMerchant.mockRejectedValue(new Error('OpenAI timeout'));

      const result = await pay({ merchant: 'KORZINKA 24' });

      expect(result.transactions[0].category).toBe('Другое');
      expect(result.transactions[0].assumptions).toContainEqual({ kind: 'category', name: 'Другое' });
      expect(await storedCount()).toBe(1);
    });

    it('is «Другое» for a name the AI gives that the user has no category of, and the record remembers «Другое»', async () => {
      openAI.categoryOfMerchant.mockResolvedValue('Казино');

      const result = await pay();

      expect(result.transactions[0].category).toBe('Другое');
      expect(result.transactions[0].assumptions).toContainEqual({ kind: 'category', name: 'Другое' });
      expect((await stored(result.transactions[0].id)).originalParsing).toMatchObject({ category: 'Другое', amount: 25_000 });
    });

    // What learning does with the record's own originalText; the correction through PUT { categoryId } that records
    // it is tested in categoryCorrectionLearning.test.ts (FT-184)
    it('of a merchant learned from the merchant’s earlier records needs no AI', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft176-learning-'));
      try {
        fs.mkdirSync(path.join(dir, 'data'));
        const learning = new TransactionLearningService(dir);
        service = serviceWith(learning);
        openAI.categoryOfMerchant.mockResolvedValue('Другое');

        // A pattern counts from its second use (MIN_PATTERN_USES)
        for (let paid = 0; paid < 2; paid += 1) {
          const record = await stored((await pay({ merchant: 'KORZINKA 24' })).transactions[0].id);
          await learning.recordCorrection(record.originalText!, record.originalParsing!, { category: 'groceries' }, USER, 0.8);
        }
        openAI.categoryOfMerchant.mockClear();
        const next = await pay({ merchant: 'KORZINKA 7' });

        expect(next.transactions[0].category).toBe('Продукты');
        expect(openAI.categoryOfMerchant).not.toHaveBeenCalled();
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('the account by the name of the card’s account', () => {
    it('is the account of that name, and the payment needs no review', async () => {
      const humo = await account('Humo');

      const result = await pay({ merchant: 'EVOS', accountName: 'humo' });

      expect(result.status).toBe('saved');
      expect(result.ack.title).toBe('Записал');
      expect(result.transactions[0]).toMatchObject({ accountId: humo.id, accountName: 'Humo', needsReview: false });
      expect(result.transactions[0].assumptions).toContainEqual({ kind: 'account', name: 'Humo', reason: 'hint' });
    });

    it('is the one of exactly that name, without case, spaces around and «ё»: «Карта Visa», «карта», «Ёлка»', async () => {
      const visa = await account('Карта Visa');
      const tree = await account('Ёлка');

      const ofVisa = await pay({ merchant: 'EVOS', accountName: 'Карта Visa' });
      const ofCard = await pay({ merchant: 'EVOS', accountName: 'карта' });
      const ofTree = await pay({ merchant: 'EVOS', accountName: ' елка ' });

      expect(ofVisa.transactions[0]).toMatchObject({ accountId: visa.id, needsReview: false });
      expect(ofCard.transactions[0]).toMatchObject({ accountName: 'Карта', needsReview: false });
      expect(ofTree.transactions[0]).toMatchObject({ accountId: tree.id, needsReview: false });
    });

    it.each([
      ['an unknown name', { accountName: 'Kapitalbank' }],
      ['no name', {}],
      // The phone's names are typed by hand: a longer or another name is not the account, whatever it holds
      ['a name that only holds an account’s name', { accountName: 'Humo Black' }],
      ['an account’s name with another word', { accountName: 'Visa карта' }],
    ])('with %s is the default account, and the payment awaits review', async (_why, extra) => {
      await account('Humo');

      const result = await pay({ merchant: 'EVOS', ...extra });

      expect(result.status).toBe('needs_review');
      expect(result.review.reasons).toEqual(['transaction_needs_review']);
      expect(result.transactions[0]).toMatchObject({ accountName: 'Карта', needsReview: true });
      expect(result.transactions[0].assumptions).toContainEqual({ kind: 'account', name: 'Карта', reason: 'default' });
      expect(await stored(result.transactions[0].id)).toMatchObject({ needsReview: true });
    });

    it('in dollars without a dollar account keeps the dollars on the default account, for review', async () => {
      const result = await pay({ merchant: 'EVOS', amountMinor: 450, currency: 'USD', accountName: 'Карта' });

      expect(result.transactions[0]).toMatchObject({ currency: 'USD', amount: 4.5, accountName: 'Карта', needsReview: true });
      expect(result.transactions[0].assumptions).toContainEqual({ kind: 'currency', currency: 'USD', reason: 'no_usd_account' });
    });
  });

  describe('a repeat', () => {
    it('with the same clientId answers with the first record and writes nothing', async () => {
      const clientId = randomUUID();
      const first = await pay({ clientId });
      const repeat = await pay({ clientId, capturedAt: new Date('2026-08-01T12:00:00.000Z') });

      expect(repeat.repeated).toBe(true);
      expect(repeat.transactions.map(record => record.id)).toEqual(first.transactions.map(record => record.id));
      expect(repeat.source).toBe('apple_pay');
      expect(await storedCount()).toBe(1);
      expect(openAI.categoryOfMerchant).toHaveBeenCalledTimes(1);
    });

    it('of a clientId a phrase used answers with that record and says where it came from', async () => {
      const clientId = randomUUID();
      const phrase = await service.capture({ text: 'кофе 25000', userId: USER, source: 'ios_shortcut', clientId });

      const repeat = await pay({ clientId });

      expect(repeat).toMatchObject({ repeated: true, source: 'ios_shortcut' });
      expect(repeat.transactions.map(record => record.id)).toEqual(phrase.transactions.map(record => record.id));
      expect(await storedCount()).toBe(1);
    });

    it('sent twice at once writes one record', async () => {
      const clientId = randomUUID();

      const [first, second] = await Promise.all([pay({ clientId }), pay({ clientId })]);

      expect(second.transactions[0].id).toBe(first.transactions[0].id);
      expect(await storedCount()).toBe(1);
    });
  });
});

/** A chat completion as the OpenAI API answers it; the request body is kept for the test to read. */
function completionFetch(content: string) {
  const requests: Array<{ messages: Array<{ role: string; content: string }> }> = [];
  const fetch = jest.fn(async (_url: unknown, init?: { body?: unknown }) => {
    requests.push(JSON.parse(String(init?.body)));
    const body = {
      id: 'chatcmpl-1', object: 'chat.completion', created: 0, model: 'test',
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
    };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  return { fetch, requests };
}

describe('the AI chooses the category of a merchant, and nothing else (FT-176)', () => {
  const categories = [
    { type: 'expense' as const, name: 'Продукты', hints: ['магазин'] },
    { type: 'expense' as const, name: 'Кафе', hints: [] },
    { type: 'income' as const, name: 'Зарплата', hints: [] },
  ];

  it('is told the merchant and the user’s expense categories, and answers with one name', async () => {
    const { fetch, requests } = completionFetch(JSON.stringify({ category: 'Продукты' }));
    const service = new OpenAITranscriptionService('test-api-key', { fetch: fetch as never });

    const category = await service.categoryOfMerchant('KORZINKA 24', { categories });

    expect(category).toBe('Продукты');
    const prompt = requests[0].messages.map(message => message.content).join('\n');
    expect(prompt).toContain('Продукты (магазин)');
    expect(prompt).not.toContain('Зарплата');
    expect(requests[0].messages[requests[0].messages.length - 1]).toEqual({ role: 'user', content: 'KORZINKA 24' });
  });

  it.each([
    ['an empty category', JSON.stringify({ category: '  ' })],
    ['no category', JSON.stringify({ items: [] })],
  ])('answers «Другое» for %s', async (_why, content) => {
    const { fetch } = completionFetch(content);
    const service = new OpenAITranscriptionService('test-api-key', { fetch: fetch as never });

    expect(await service.categoryOfMerchant('KORZINKA 24', { categories })).toBe('Другое');
  });

  it('fails on an answer that is not JSON, so the payment goes to «Другое ?»', async () => {
    const { fetch } = completionFetch('Продукты');
    const service = new OpenAITranscriptionService('test-api-key', { fetch: fetch as never });

    await expect(service.categoryOfMerchant('KORZINKA 24', { categories })).rejects.toMatchObject({ code: 'EXTERNAL_SERVICE_ERROR' });
  });
});
