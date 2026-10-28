import fs from 'fs';
import os from 'os';
import path from 'path';
import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { categoryNamedIn, namingWordsOf } from '../src/modules/voiceProcessing/domain/categoryGuess';
import { buildCategoryPrompt } from '../src/modules/voiceProcessing/domain/categoryPrompt';
import { CATEGORY_PRESETS, presetForLegacyCategory, presetSynonyms } from '../src/modules/category/domain/categoryPresets';
import { TransactionLearningService } from '../src/shared/application/learning/transactionLearning';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';

/**
 * FT-150: a brand of many services — «Яндекс», «Uber» — names no category by itself: «яндекс плюс» is a
 * subscription, «uber eats» is food. A bare brand goes to the AI; with its service word («яндекс такси»,
 * «yandex go») or the plain word («такси») the phrase is «Транспорт» without the AI.
 */

const TRANSPORT = { name: 'Транспорт', type: 'expense' as const, presetKey: 'transport' };
const BARE_BRANDS = ['яндекс', 'yandex', 'uber'];
const SEED = path.join(__dirname, '..', 'data', 'patterns.seed.json');

describe('a bare brand in the category dictionary (FT-150)', () => {
  it('is not a word of any starter category', () => {
    const words = CATEGORY_PRESETS.flatMap(preset => presetSynonyms(preset)).map(word => word.toLocaleLowerCase('ru-RU'));

    for (const brand of BARE_BRANDS) expect(words).not.toContain(brand);
  });

  it('names no category; with its service word it names «Транспорт»', () => {
    for (const text of ['яндекс', 'Yandex', 'uber', 'яндекс плюс', 'uber eats']) {
      expect(categoryNamedIn(text, TRANSPORT)).toBe(false);
    }
    for (const text of ['такси', 'яндекс такси', 'Yandex Go', 'яндекс го', 'uber taxi']) {
      expect(categoryNamedIn(text, TRANSPORT)).toBe(true);
    }
  });

  it.each([
    ['яндекс', 'Другое'],
    ['Yandex', 'Другое'],
    ['uber', 'Другое'],
    ['yandex go', 'Транспорт'],
    ['Яндекс Го', 'Транспорт'],
    ['такси', 'Транспорт'],
  ])('as a value to resolve — an AI-less label, a record queued offline — «%s» is «%s»', (value, name) => {
    expect(presetForLegacyCategory(value, 'expense').name).toBe(name);
  });

  it('is not a hint of «Транспорт» in the AI prompt', () => {
    const transport = buildCategoryPrompt().split('\n').find(line => line.startsWith('  - Транспорт'))!;

    expect(transport).toContain('такси');
    expect(transport).not.toMatch(/яндекс(?! го)|yandex|uber/i);
  });
});

describe('a bare brand in learned patterns (FT-150)', () => {
  it('names nothing as a keyword or a merchant alias; an alias with more words still does', () => {
    const words = namingWordsOf({
      categories: [{ key: 'transport', keywords: ['такси', 'yandex', 'яндекса', 'uber'] }],
      merchants: [{ key: 'transport', aliases: ['яндекс', 'yandex go'] }],
    });

    expect(words.get('transport')).toEqual(['такси', 'yandex go']);
  });

  it('is not in the shipped seed', () => {
    const seed = JSON.parse(fs.readFileSync(SEED, 'utf-8')) as { categories: Array<{ keywords: string[] }> };
    const keywords = seed.categories.flatMap(pattern => pattern.keywords).map(word => word.toLocaleLowerCase('ru-RU'));

    for (const brand of BARE_BRANDS) expect(keywords).not.toContain(brand);
  });
});

describe('a bare brand on the text fast path (FT-150)', () => {
  let db: TestDatabase;
  let tempDir: string;
  let openAI: jest.Mocked<Pick<TranscriptionService, 'analyzeInput' | 'transcribe'>>;
  let capture: ProcessTextInputUseCase;

  const answer = (category: string, amount: number, description: string) => ({
    transactions: [{ intent: 'transaction' as const, amount, category, type: 'expense' as const, description, date: '2026-10-29' }],
    debts: [],
  });
  const guessOf = (assumptions: { kind: string }[] | undefined) => assumptions?.find(a => a.kind === 'category');

  beforeEach(async () => {
    db = await openMigratedDatabase();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft150-'));
    fs.mkdirSync(path.join(tempDir, 'data'), { recursive: true });
    fs.copyFileSync(SEED, path.join(tempDir, 'data', 'patterns.seed.json'));
    openAI = { analyzeInput: jest.fn(), transcribe: jest.fn() };
    const records = recordsOn(db.dataSource);
    capture = new ProcessTextInputUseCase(
      openAI as unknown as TranscriptionService, records.create, undefined, records.catalog, new TransactionLearningService(tempDir)
    );
  });

  afterEach(async () => {
    await db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.each(['яндекс 20000', 'yandex 20000', 'uber 20000'])('«%s» goes to the AI, and its choice is a guess', async phrase => {
    openAI.analyzeInput.mockResolvedValue(answer('Транспорт', 20000, phrase.split(' ')[0]));

    const result = await capture.execute(phrase, 'user-1');

    expect(openAI.analyzeInput).toHaveBeenCalledTimes(1);
    expect(result.transactions[0].category).toBe('Транспорт');
    expect(guessOf(result.transactions[0].assumptions)).toEqual({ kind: 'category', name: 'Транспорт' });
  });

  it.each(['такси 18000', 'яндекс такси 18000', 'yandex go 18000', 'Яндекс Го 18000'])('«%s» is «Транспорт» without the AI', async phrase => {
    const result = await capture.execute(phrase, 'user-1');

    expect(openAI.analyzeInput).not.toHaveBeenCalled();
    expect(result.transactions[0]).toEqual(expect.objectContaining({ category: 'Транспорт', amount: 18000 }));
    expect(guessOf(result.transactions[0].assumptions)).toBeUndefined();
  });

  it('«яндекс плюс 99000» and «uber eats 120000» go to the AI, not to «Транспорт»', async () => {
    openAI.analyzeInput
      .mockResolvedValueOnce(answer('Связь', 99000, 'Яндекс Плюс'))
      .mockResolvedValueOnce(answer('Кафе', 120000, 'Uber Eats'));

    const plus = await capture.execute('яндекс плюс 99000', 'user-1');
    const eats = await capture.execute('uber eats 120000', 'user-1');

    expect(openAI.analyzeInput.mock.calls.map(([text]) => text)).toEqual(['яндекс плюс 99000', 'uber eats 120000']);
    expect(plus.transactions[0].category).toBe('Связь');
    expect(eats.transactions[0].category).toBe('Кафе');
  });

  it.each(['яндекс 20000', 'яндекс плюс 99000', 'uber eats 120000'])(
    'when the AI cannot read «%s» it is «Другое ?», not «Транспорт»',
    async phrase => {
      openAI.analyzeInput.mockRejectedValue(new Error('401 Incorrect API key'));

      const result = await capture.execute(phrase, 'user-1');

      expect(result.transactions[0].category).toBe('Другое');
      expect(guessOf(result.transactions[0].assumptions)).toEqual({ kind: 'category', name: 'Другое' });
    }
  );

  it('a learning file written from the old seed does not keep a bare brand on the fast path', async () => {
    // patterns.json is written on the first correction from the seed of its day, so a live one may still hold «yandex»
    fs.writeFileSync(path.join(tempDir, 'data', 'patterns.json'), JSON.stringify({
      categories: [{ keywords: ['заправился', 'азс', 'такси', 'yandex'], category: 'transport', confidence: 0.7, usageCount: 2 }],
      merchants: [{ aliases: ['yandex go', 'яндекс'], normalizedName: 'Yandex Go', category: 'transport', usageCount: 2 }],
    }));
    openAI.analyzeInput.mockResolvedValue(answer('Транспорт', 20000, 'Яндекс'));

    await capture.execute('yandex 20000', 'user-1');
    await capture.execute('яндекс 20000', 'user-1');
    // The other words of the same pattern still give the category
    const refuelled = await capture.execute('заправился 20000', 'user-1');

    expect(openAI.analyzeInput.mock.calls.map(([text]) => text)).toEqual(['yandex 20000', 'яндекс 20000']);
    expect(refuelled.transactions[0].category).toBe('Транспорт');
  });
});
