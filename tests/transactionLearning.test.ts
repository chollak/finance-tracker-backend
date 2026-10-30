import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  TransactionLearningService,
  migrateLearningData,
  migratePatterns,
} from '../src/shared/application/learning/transactionLearning';

describe('TransactionLearningService runtime data policy', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'learning-policy-'));
    fs.mkdirSync(path.join(tempDir, 'data'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('loads prompt patterns from tracked seed file when runtime patterns file is absent', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'data', 'patterns.seed.json'),
      JSON.stringify({
        categories: [
          { keywords: ['evos'], category: 'restaurants', confidence: 0.8, usageCount: 2 }
        ],
        merchants: []
      })
    );

    const service = new TransactionLearningService(tempDir);

    const enhancedPrompt = await service.getEnhancedPrompts('BASE PROMPT');

    expect(enhancedPrompt).toContain('BASE PROMPT');
    expect(enhancedPrompt).toContain('evos');
    // The old static id is shown as the starter category it moved into (FT-099)
    expect(enhancedPrompt).toContain('"evos" → Кафе');
    expect(fs.existsSync(path.join(tempDir, 'data', 'patterns.json'))).toBe(false);
  });

  it('creates ignored runtime learning files from tracked seed data when recording a correction', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'data', 'learning-data.seed.json'),
      JSON.stringify([
        {
          originalText: 'seed text',
          originalParsing: { amount: 0, category: 'other', type: 'expense', confidence: 0.3 },
          userCorrection: { category: 'restaurants' },
          userId: 'system-seed',
          timestamp: '2026-01-01T00:00:00.000Z',
          confidence: 0.3
        }
      ])
    );
    fs.writeFileSync(
      path.join(tempDir, 'data', 'patterns.seed.json'),
      JSON.stringify({ categories: [], merchants: [] })
    );

    const service = new TransactionLearningService(tempDir);

    await service.recordCorrection(
      'купил в evos',
      { amount: 0, category: 'other', type: 'expense', confidence: 0.3 },
      { category: 'restaurants', merchant: 'Evos' },
      'user-1',
      0.3
    );

    const learningData = JSON.parse(fs.readFileSync(path.join(tempDir, 'data', 'learning-data.json'), 'utf-8'));
    const patterns = JSON.parse(fs.readFileSync(path.join(tempDir, 'data', 'patterns.json'), 'utf-8'));

    expect(learningData).toHaveLength(2);
    expect(learningData[0].userId).toBe('system-seed');
    expect(learningData[1].userId).toBe('user-1');
    expect(patterns.categories[0].category).toBe('restaurants');
  });

  describe('categories after FT-099', () => {
    it('maps old static ids to starter keys and merges patterns that land on the same key', () => {
      const migrated = migratePatterns({
        categories: [
          { keywords: ['evos'], category: 'restaurants', confidence: 0.7, usageCount: 2 },
          { keywords: ['кофейня', 'evos'], category: 'coffee', confidence: 0.9, usageCount: 1 },
          { keywords: ['азс'], category: 'fuel', confidence: 0.7, usageCount: 1 },
          { keywords: ['премия'], category: 'bonus', confidence: 0.6, usageCount: 1 },
          { keywords: ['кино'], category: 'transport', confidence: 0.5, usageCount: 1 },
        ],
        merchants: [{ aliases: ['korzinka'], normalizedName: 'Korzinka', category: 'groceries', usageCount: 1 }],
      });

      expect(migrated.categories).toEqual([
        { keywords: ['evos', 'кофейня'], category: 'cafe', confidence: 0.9, usageCount: 3 },
        { keywords: ['азс', 'кино'], category: 'transport', confidence: 0.7, usageCount: 2 },
        { keywords: ['премия'], category: 'salary', confidence: 0.6, usageCount: 1 },
      ]);
      expect(migrated.merchants[0].category).toBe('groceries');
      // Already migrated data stays as it is
      expect(migratePatterns(migrated)).toEqual(migrated);
    });

    it('maps the categories in learning history', () => {
      const [entry] = migrateLearningData([{
        originalText: 'такси 18000',
        originalParsing: { amount: 18000, category: 'taxi', type: 'expense' },
        userCorrection: { category: 'entertainment' },
        userId: 'u',
        timestamp: '2026-10-16T00:00:00Z',
        confidence: 0.8,
      }]);
      expect(entry.originalParsing.category).toBe('transport');
      expect(entry.userCorrection.category).toBe('other');
    });

    it("shows patterns in the user's names and leaves out categories the user hid", async () => {
      fs.writeFileSync(
        path.join(tempDir, 'data', 'patterns.seed.json'),
        JSON.stringify({
          categories: [
            { keywords: ['evos'], category: 'cafe', confidence: 0.8, usageCount: 2 },
            { keywords: ['азс'], category: 'transport', confidence: 0.8, usageCount: 2 },
          ],
          merchants: [],
        })
      );
      const service = new TransactionLearningService(tempDir);

      // «Кафе» renamed to «Рестораны»; «Транспорт» hidden, so not among the names
      const prompt = await service.getEnhancedPrompts('BASE', new Map([['cafe', 'Рестораны']]));

      expect(prompt).toContain('"evos" → Рестораны');
      expect(prompt).not.toContain('азс');
    });
  });

  describe('lessons of a category correction (FT-184)', () => {
    const parsing = { amount: 25000, category: 'Покупки', type: 'expense' as const };
    const words = (recordId: string, presetKey: string, ...lessonWords: string[]) =>
      ({ kind: 'words' as const, recordId, userId: 'user-1', presetKey, originalParsing: parsing, words: lessonWords });
    const merchant = (recordId: string, presetKey: string, key: string) =>
      ({ kind: 'merchant' as const, recordId, userId: 'user-1', presetKey, originalParsing: parsing, merchant: key });
    const dataFile = (name: string) => path.join(tempDir, 'data', name);
    const readPatterns = () => JSON.parse(fs.readFileSync(dataFile('patterns.json'), 'utf-8'));
    const readHistory = () => JSON.parse(fs.readFileSync(dataFile('learning-data.json'), 'utf-8'));
    const seed = (categories: unknown[]) =>
      fs.writeFileSync(dataFile('patterns.seed.json'), JSON.stringify({ categories, merchants: [] }));

    it('a word gives its category as a guess after one lesson and for sure after two, counted per word', async () => {
      const service = new TransactionLearningService(tempDir);

      await service.learnCategory(words('r1', 'groceries', 'zzqx'));
      expect((await service.tentativeCategoryWords()).get('groceries')).toEqual(['zzqx']);
      expect((await service.learnedCategoryWords()).get('groceries')).toBeUndefined();

      // Another word's lesson for the same category does not count for «zzqx»
      await service.learnCategory(words('r2', 'groceries', 'wwpt'));
      expect((await service.learnedCategoryWords()).get('groceries')).toBeUndefined();

      await service.learnCategory(words('r3', 'groceries', 'zzqx'));
      expect((await service.learnedCategoryWords()).get('groceries')).toEqual(['zzqx']);
      expect((await service.tentativeCategoryWords()).get('groceries')).toEqual(['wwpt']);
      expect(readHistory()).toHaveLength(3);
      expect(readHistory()[0]).toMatchObject({ recordId: 'r1', userCorrection: { category: 'groceries' }, lessonWords: ['zzqx'] });
    });

    it('a word two categories were taught gives neither', async () => {
      const service = new TransactionLearningService(tempDir);

      for (const [recordId, key] of [['r1', 'groceries'], ['r2', 'groceries'], ['r3', 'shopping']]) {
        await service.learnCategory(words(recordId, key, 'zzqx'));
      }

      expect((await service.learnedCategoryWords()).get('groceries')).toBeUndefined();
      expect((await service.tentativeCategoryWords()).get('shopping')).toBeUndefined();
    });

    it('a lesson without words counts nothing', async () => {
      const service = new TransactionLearningService(tempDir);

      await service.learnCategory(words('r1', 'groceries'));
      await service.learnCategory(merchant('r2', 'groceries', ''));

      expect(fs.existsSync(dataFile('patterns.json'))).toBe(false);
      expect(fs.existsSync(dataFile('learning-data.json'))).toBe(false);
    });

    it('the seed keeps its own rule: a pattern counts from its second use, whatever the lessons of words do', async () => {
      seed([{ keywords: ['evos'], category: 'cafe', confidence: 0.8, usageCount: 2 }]);
      const service = new TransactionLearningService(tempDir);

      await service.learnCategory(words('r1', 'cafe', 'zzqx'));

      expect((await service.learnedCategoryWords()).get('cafe')).toEqual(['evos']);
      expect((await service.tentativeCategoryWords()).get('cafe')).toEqual(['zzqx']);
      expect(readPatterns().categories).toEqual([{ keywords: ['evos'], category: 'cafe', confidence: 0.8, usageCount: 2 }]);
    });

    it('a payment teaches its whole merchant at once; a later correction moves it', async () => {
      const service = new TransactionLearningService(tempDir);

      await service.learnCategory(merchant('r1', 'cafe', 'kkwq paynet uzcard'));
      expect((await service.learnedMerchants()).get('kkwq paynet uzcard')).toBe('cafe');
      expect((await service.learnedMerchants()).get('paynet mobile')).toBeUndefined();
      // Not a word of phrases
      expect((await service.learnedCategoryWords()).get('cafe')).toBeUndefined();
      expect((await service.tentativeCategoryWords()).get('cafe')).toBeUndefined();

      await service.learnCategory(merchant('r2', 'groceries', 'kkwq paynet uzcard'));
      expect((await service.learnedMerchants()).get('kkwq paynet uzcard')).toBe('groceries');
    });

    it('unlearning a record takes back exactly its lesson: the counts of its words, its merchant', async () => {
      const service = new TransactionLearningService(tempDir);
      await service.learnCategory(words('r1', 'groceries', 'zzqx', 'wwpt'));
      await service.learnCategory(words('r2', 'groceries', 'zzqx'));
      await service.learnCategory(merchant('r3', 'cafe', 'kkwq'));
      await service.learnCategory(merchant('r4', 'groceries', 'kkwq'));

      await service.unlearnRecord('r1');
      await service.unlearnRecord('r4');

      expect((await service.tentativeCategoryWords()).get('groceries')).toEqual(['zzqx']);
      expect((await service.learnedMerchants()).get('kkwq')).toBe('cafe');

      await service.unlearnRecord('r2');
      await service.unlearnRecord('r3');
      await service.unlearnRecord('r-never-taught');

      expect(readPatterns()).toMatchObject({ words: [], merchants: [] });
      expect(readHistory()).toEqual([]);
    });

    it('lessons learned at the same moment are all kept', async () => {
      const service = new TransactionLearningService(tempDir);
      const merchants = ['aaqx', 'bbqx', 'ccqx', 'ddqx', 'eeqx'];

      await Promise.all(merchants.map((word, index) => service.learnCategory(words(`r${index}`, 'groceries', word))));

      expect([...(await service.tentativeCategoryWords()).get('groceries')!].sort()).toEqual(merchants);
      expect(readHistory()).toHaveLength(5);
    });

    it.each(['patterns.json', 'learning-data.json'])('a broken %s is kept beside it before it is written anew', async name => {
      fs.writeFileSync(dataFile(name), '{ not json');
      const service = new TransactionLearningService(tempDir);

      await service.learnCategory(words('r1', 'groceries', 'zzqx'));

      const kept = fs.readdirSync(path.join(tempDir, 'data')).filter(file => file.startsWith(`${name}.corrupt-`));
      expect(kept).toHaveLength(1);
      expect(fs.readFileSync(dataFile(kept[0]), 'utf-8')).toBe('{ not json');
      expect(() => JSON.parse(fs.readFileSync(dataFile(name), 'utf-8'))).not.toThrow();
    });

    it('the AI prompt shows a learned word only once it gives its category for sure', async () => {
      const service = new TransactionLearningService(tempDir);
      await service.learnCategory(words('r1', 'groceries', 'zzqx'));
      await service.learnCategory(words('r2', 'groceries', 'wwpt'));
      await service.learnCategory(words('r3', 'groceries', 'zzqx'));

      const prompt = await service.getEnhancedPrompts('BASE');

      expect(prompt).toContain('"zzqx" → Продукты');
      expect(prompt).not.toContain('wwpt');
    });
  });
});
