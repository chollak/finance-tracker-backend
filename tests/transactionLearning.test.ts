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
    const lesson = (words: string, presetKey: string, userId = 'user-1') => ({ userId, words, presetKey, originalParsing: parsing });
    const readPatterns = () => JSON.parse(fs.readFileSync(path.join(tempDir, 'data', 'patterns.json'), 'utf-8'));
    const patternOf = (key: string) => readPatterns().categories.find((pattern: { category: string }) => pattern.category === key);
    const seed = (categories: unknown[]) =>
      fs.writeFileSync(path.join(tempDir, 'data', 'patterns.seed.json'), JSON.stringify({ categories, merchants: [] }));

    it('learning ties the words to the starter key and keeps the correction in the history', async () => {
      const service = new TransactionLearningService(tempDir);

      await service.learnCategory(lesson('ZZQX 77', 'groceries'));
      await service.learnCategory(lesson('ZZQX 78', 'groceries'));

      expect(patternOf('groceries')).toMatchObject({ keywords: ['zzqx'], usageCount: 2 });
      expect((await service.learnedCategoryWords()).get('groceries')).toEqual(['zzqx']);
      const history = JSON.parse(fs.readFileSync(path.join(tempDir, 'data', 'learning-data.json'), 'utf-8'));
      expect(history).toHaveLength(2);
      // The history keeps starter keys (FT-099): «Покупки» of the parse is read back as `shopping`
      expect(history[0]).toMatchObject({
        originalText: 'zzqx 77', originalParsing: { amount: 25000, type: 'expense' }, userCorrection: { category: 'groceries' }, userId: 'user-1',
      });
    });

    it('unlearning takes back only the words the lesson added: the seed’s words and count stay', async () => {
      seed([{ keywords: ['evos'], category: 'cafe', confidence: 0.8, usageCount: 2 }]);
      const service = new TransactionLearningService(tempDir);

      await service.learnCategory(lesson('evos zzqx', 'cafe'));
      await service.unlearnCategory(lesson('evos zzqx', 'cafe'));

      expect(patternOf('cafe')).toMatchObject({ keywords: ['evos'], usageCount: 2 });
      expect((await service.learnedCategoryWords()).get('cafe')).toEqual(['evos']);
      expect(JSON.parse(fs.readFileSync(path.join(tempDir, 'data', 'learning-data.json'), 'utf-8'))).toEqual([]);
    });

    it('unlearning keeps a word another lesson of the category taught too, and that lesson can take it back later', async () => {
      const service = new TransactionLearningService(tempDir);

      await service.learnCategory(lesson('ZZQX 77', 'groceries'));
      await service.learnCategory(lesson('ZZQX 78', 'groceries'));
      await service.unlearnCategory(lesson('ZZQX 77', 'groceries'));

      expect(patternOf('groceries')).toMatchObject({ keywords: ['zzqx'], usageCount: 1 });

      await service.unlearnCategory(lesson('ZZQX 78', 'groceries'));

      expect(patternOf('groceries')).toBeUndefined();
    });

    it('unlearning what no lesson taught — another category, another user, a record edited before FT-184 — changes nothing', async () => {
      seed([{ keywords: ['evos'], category: 'cafe', confidence: 0.8, usageCount: 2 }]);
      const service = new TransactionLearningService(tempDir);
      await service.learnCategory(lesson('ZZQX 77', 'groceries'));

      await service.unlearnCategory(lesson('ZZQX 77', 'shopping'));
      await service.unlearnCategory(lesson('ZZQX 77', 'groceries', 'user-2'));
      await service.unlearnCategory(lesson('evos', 'cafe'));

      expect(patternOf('groceries')).toMatchObject({ keywords: ['zzqx'], usageCount: 1 });
      expect(patternOf('cafe')).toMatchObject({ keywords: ['evos'], usageCount: 2 });
    });
  });
});
