import fs from 'fs';
import os from 'os';
import path from 'path';
import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { ProcessVoiceInputUseCase } from '../src/modules/voiceProcessing/application/processVoiceInput';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { categoryNamedIn, LearnedCategoryWords } from '../src/modules/voiceProcessing/domain/categoryGuess';
import { TransactionLearningService } from '../src/shared/application/learning/transactionLearning';
import { buildCaptureAck } from '../src/modules/quickCapture/application/buildCaptureAck';
import { toCapturedTransaction } from '../src/modules/quickCapture/application/toCapturedTransaction';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';

/**
 * FT-138, decision of 2026-10-20: «?» on a category only when the AI picked it itself. A category the text
 * names — by the user's name of it, by a word of the category dictionary, or by a word a learned pattern ties
 * to it — is not a guess, and neither is one the text paths read from the words without the AI.
 */

const CAFE = { name: 'Кафе', type: 'expense' as const, presetKey: 'cafe' };
const GROCERIES = { name: 'Продукты', type: 'expense' as const, presetKey: 'groceries' };
const FREELANCE = { name: 'Фриланс', type: 'income' as const, presetKey: 'freelance' };

describe('whether the words name the category (FT-138)', () => {
  it('the user’s own name of the category, in any case and with «ё» as «е»', () => {
    expect(categoryNamedIn('обед в кафе', CAFE)).toBe(true);
    expect(categoryNamedIn('КАФЕ у дома', CAFE)).toBe(true);
    expect(categoryNamedIn('ужин', { name: 'Ёлка', type: 'expense', presetKey: null })).toBe(false);
    expect(categoryNamedIn('елка на новый год', { name: 'Ёлка', type: 'expense', presetKey: null })).toBe(true);
  });

  it('a word of the dictionary of its starter category, also with another ending', () => {
    expect(categoryNamedIn('кофе', CAFE)).toBe(true);
    expect(categoryNamedIn('обедали с коллегами', CAFE)).toBe(true);
    expect(categoryNamedIn('купил продуктов на неделю', GROCERIES)).toBe(true);
    expect(categoryNamedIn('фриланс за лендинг', FREELANCE)).toBe(true);
  });

  it('a renamed starter category keeps its dictionary', () => {
    expect(categoryNamedIn('кофе с собой', { ...CAFE, name: 'Кофейни' })).toBe(true);
  });

  it('a word only inside another word does not count', () => {
    // «чай» of the coffee dictionary is not in «случайно», «вода» of home bills is not in «водитель»
    expect(categoryNamedIn('случайно', CAFE)).toBe(false);
    expect(categoryNamedIn('водитель', { name: 'Дом', type: 'expense', presetKey: 'home' })).toBe(false);
    expect(categoryNamedIn('вода и свет', { name: 'Дом', type: 'expense', presetKey: 'home' })).toBe(true);
  });

  it('a word a learned pattern ties to the category', () => {
    expect(categoryNamedIn('uzum', { name: 'Покупки', type: 'expense', presetKey: 'shopping' })).toBe(false);
    expect(categoryNamedIn('uzum', { name: 'Покупки', type: 'expense', presetKey: 'shopping' }, ['uzum'])).toBe(true);
  });

  it('words that point at another category do not name this one', () => {
    expect(categoryNamedIn('за лендинг', FREELANCE)).toBe(false);
    expect(categoryNamedIn('такси до работы', CAFE)).toBe(false);
  });
});

describe('learned words for the guess rule (FT-138)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'learned-words-'));
    fs.mkdirSync(path.join(tempDir, 'data'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('are the patterns the AI prompt shows, by starter key: keywords and merchant aliases, without bare numbers', async () => {
    fs.writeFileSync(path.join(tempDir, 'data', 'patterns.json'), JSON.stringify({
      categories: [
        { keywords: ['evos', '25000'], category: 'restaurants', confidence: 0.8, usageCount: 2 },
        { keywords: ['once'], category: 'shopping', confidence: 0.6, usageCount: 1 },
      ],
      merchants: [
        { aliases: ['uzum market', 'узум'], normalizedName: 'Uzum', category: 'shopping', usageCount: 3 },
      ],
    }));

    const words = await new TransactionLearningService(tempDir).learnedCategoryWords();

    // «restaurants» of before FT-099 is the starter «cafe» now
    expect(words.get('cafe')).toEqual(['evos']);
    // a pattern used once is not shown to the AI, so it does not count either
    expect(words.get('shopping')).toEqual(['uzum market', 'узум']);
  });

  it('are empty without patterns', async () => {
    expect((await new TransactionLearningService(tempDir).learnedCategoryWords()).size).toBe(0);
  });
});

describe('the category guess of a capture (FT-138)', () => {
  let db: TestDatabase;
  let records: ReturnType<typeof recordsOn>;
  let openAI: jest.Mocked<Pick<TranscriptionService, 'analyzeInput' | 'transcribe'>>;
  let learned: LearnedCategoryWords & { learnedCategoryWords: jest.Mock };
  let capture: ProcessTextInputUseCase;

  const guessOf = (assumptions: { kind: string }[] | undefined) => assumptions?.find(a => a.kind === 'category');

  beforeEach(async () => {
    db = await openMigratedDatabase();
    records = recordsOn(db.dataSource);
    openAI = { analyzeInput: jest.fn(), transcribe: jest.fn() };
    learned = { learnedCategoryWords: jest.fn().mockResolvedValue(new Map()) };
    capture = new ProcessTextInputUseCase(openAI as unknown as TranscriptionService, records.create, undefined, records.catalog, learned);
  });

  afterEach(async () => {
    await db.close();
  });

  describe('without the AI', () => {
    it('a dictionary word («такси», «кофе») gives the category — no guess', async () => {
      const taxi = await capture.execute('такси 18000', 'user-1');
      const coffee = await capture.execute('кофе 45', 'user-1');

      expect(openAI.analyzeInput).not.toHaveBeenCalled();
      expect(taxi.transactions[0].category).toBe('Транспорт');
      expect(guessOf(taxi.transactions[0].assumptions)).toBeUndefined();
      expect(coffee.transactions[0].category).toBe('Кафе');
      expect(coffee.transactions[0].assumptions).toEqual([
        { kind: 'thousands', written: '45', amount: 45000 },
        { kind: 'account', name: 'Карта', reason: 'default' },
      ]);
    });

    it('an unknown word lands in «Другое» without a guess: nobody picked it', async () => {
      const result = await capture.execute('стрижка 50000', 'user-1');

      expect(openAI.analyzeInput).not.toHaveBeenCalled();
      expect(result.transactions[0].category).toBe('Другое');
      expect(guessOf(result.transactions[0].assumptions)).toBeUndefined();
    });
  });

  describe('when the AI reads the phrase', () => {
    it('only the category the AI chose itself is a guess — the board’s phrase', async () => {
      openAI.analyzeInput.mockResolvedValue({
        transactions: [
          { intent: 'transaction', amount: 25000, category: 'Кафе', type: 'expense', description: 'кофе', date: '2026-10-14' },
          { intent: 'transaction', amount: 18000, category: 'Транспорт', type: 'expense', description: 'такси до работы', date: '2026-10-14' },
          { intent: 'transaction', amount: 300, currency: 'USD', category: 'Фриланс', type: 'income', description: 'за лендинг', date: '2026-10-13' },
        ],
        debts: [],
      });

      const result = await capture.execute('кофе 25к, такси до работы 18 тысяч наличными, вчера пришло 300 долларов за лендинг', 'user-1');

      expect(result.transactions.map(t => [t.category, guessOf(t.assumptions)])).toEqual([
        ['Кафе', undefined],
        ['Транспорт', undefined],
        ['Фриланс', { kind: 'category', name: 'Фриланс' }],
      ]);
    });

    it('in a phrase of several records each record is judged by its own words', async () => {
      openAI.analyzeInput.mockResolvedValue({
        transactions: [
          { intent: 'transaction', amount: 20000, category: 'Транспорт', type: 'expense', description: 'такси', date: '2026-10-14' },
          { intent: 'transaction', amount: 15000, category: 'Транспорт', type: 'expense', description: 'самокат', date: '2026-10-14' },
        ],
        debts: [],
      });

      const result = await capture.execute('такси 20к и самокат 15к', 'user-1');

      expect(guessOf(result.transactions[0].assumptions)).toBeUndefined();
      expect(guessOf(result.transactions[1].assumptions)).toEqual({ kind: 'category', name: 'Транспорт' });
    });

    it('a word the AI wrote into its note but the phrase does not have does not count', async () => {
      openAI.analyzeInput.mockResolvedValue({
        transactions: [
          { intent: 'transaction', amount: 180000, category: 'Покупки', type: 'expense', description: 'Покупки на Uzum', merchant: 'Uzum', date: '2026-10-14' },
          { intent: 'transaction', amount: 20000, category: 'Транспорт', type: 'expense', description: 'такси', date: '2026-10-14' },
        ],
        debts: [],
      });

      const result = await capture.execute('uzum 180к и такси 20к', 'user-1');

      expect(guessOf(result.transactions[0].assumptions)).toEqual({ kind: 'category', name: 'Покупки' });
    });

    it('a learned pattern gives the category — no guess', async () => {
      openAI.analyzeInput.mockResolvedValue({
        transactions: [{ intent: 'transaction', amount: 180000, category: 'Покупки', type: 'expense', merchant: 'Uzum', date: '2026-10-14' }],
        debts: [],
      });

      const before = await capture.execute('заказал на Uzum. 180 000', 'user-1');
      learned.learnedCategoryWords.mockResolvedValue(new Map([['shopping', ['uzum']]]));
      const after = await capture.execute('заказал на Uzum. 180 000', 'user-1');

      expect(guessOf(before.transactions[0].assumptions)).toEqual({ kind: 'category', name: 'Покупки' });
      expect(guessOf(after.transactions[0].assumptions)).toBeUndefined();
    });

    it('learned words that cannot be read do not stop the capture; the AI’s choice stays a guess', async () => {
      openAI.analyzeInput.mockResolvedValue({
        transactions: [{ intent: 'transaction', amount: 180000, category: 'Покупки', type: 'expense', merchant: 'Uzum', date: '2026-10-14' }],
        debts: [],
      });
      learned.learnedCategoryWords.mockRejectedValue(new Error('disk'));

      const result = await capture.execute('заказал на Uzum. 180 000', 'user-1');

      expect(result.transactions).toHaveLength(1);
      expect(guessOf(result.transactions[0].assumptions)).toEqual({ kind: 'category', name: 'Покупки' });
    });
  });

  describe('by voice (always the AI)', () => {
    const filePath = path.join(os.tmpdir(), `ft138-voice-${process.pid}.ogg`);

    beforeEach(() => {
      fs.writeFileSync(filePath, 'fake audio');
    });

    afterEach(() => {
      fs.rmSync(filePath, { force: true });
      fs.rmSync(`${filePath}.mp3`, { force: true });
    });

    it('follows the same rule as text', async () => {
      const voice = new ProcessVoiceInputUseCase(openAI as unknown as TranscriptionService, records.create, undefined, records.catalog, learned);
      openAI.transcribe.mockResolvedValue('кофе и круассан на сорок пять тысяч, ещё заказал на узум за сто восемьдесят');
      openAI.analyzeInput.mockResolvedValue({
        transactions: [
          { intent: 'transaction', amount: 45000, category: 'Кафе', type: 'expense', description: 'кофе и круассан', date: '2026-10-14' },
          { intent: 'transaction', amount: 180000, category: 'Покупки', type: 'expense', description: 'заказал на узум', date: '2026-10-14' },
        ],
        debts: [],
      });

      const result = await voice.execute({ filePath, userId: 'user-1' });

      expect(result.transactions.map(t => guessOf(t.assumptions))).toEqual([
        undefined,
        { kind: 'category', name: 'Покупки' },
      ]);
    });
  });

  describe('in the bot', () => {
    it('the confirmation marks the guessed category with «?», and only it', async () => {
      openAI.analyzeInput.mockResolvedValue({
        transactions: [
          { intent: 'transaction', amount: 180000, category: 'Покупки', type: 'expense', description: 'Uzum', date: '2026-10-14' },
          { intent: 'transaction', amount: 20000, category: 'Транспорт', type: 'expense', description: 'такси до работы', date: '2026-10-14' },
        ],
        debts: [],
      });

      const result = await capture.execute('uzum 180к и такси до работы 20к', 'user-1');
      // The bot sends one confirmation per record (sendCaptureResponse)
      const [uzum, taxi] = result.transactions.map(t => buildCaptureAck([toCapturedTransaction(t)], { today: '2026-10-14' }).summary);

      expect(uzum).toBe('Uzum · 180 000 сум · Покупки?');
      expect(taxi).toBe('Такси до работы · 20 000 сум · Транспорт');
    });
  });
});
