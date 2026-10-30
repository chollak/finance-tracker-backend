import path from 'path';
import { createLogger, LogCategory } from '../logging';
import { CATEGORY_PRESETS, presetKeyForLearning } from '../../../modules/category/domain/categoryPresets';
import { isBareBrand, namingWordsOf } from '../../../modules/voiceProcessing/domain/categoryGuess';
import { CategoryLesson, CategoryLessons } from '../../../modules/transaction/domain/categoryLessons';
import { CategoryPattern, LearnedPatterns, LearningData } from './learningTypes';
import { readLearningFile, writeLearningFile } from './learningFiles';
import {
  historyEntryOf,
  lessonWordsByCategory,
  merchantCategories,
  teachesAnything,
  withLesson,
  withoutLessonsOf,
} from './categoryLessonStore';

export { CategoryPattern, LearnedPatterns, LearningData, MerchantPattern } from './learningTypes';

const logger = createLogger(LogCategory.LEARNING);

/** A pattern counts once it has been used this many times: the AI prompt shows it, and it names a category (FT-138). */
export const MIN_PATTERN_USES = 2;

/** The history keeps the latest corrections only. */
const HISTORY_LIMIT = 1000;

export class TransactionLearningService implements CategoryLessons {
  private learningDataPath: string;
  private patternsPath: string;
  private learningDataSeedPath: string;
  private patternsSeedPath: string;
  /** The files are read, changed and written whole: one change at a time, or two at once lose one (FT-184). */
  private changes: Promise<unknown> = Promise.resolve();

  constructor(rootDir: string = process.cwd()) {
    const dataDir = path.join(rootDir, 'data');
    this.learningDataPath = path.join(dataDir, 'learning-data.json');
    this.patternsPath = path.join(dataDir, 'patterns.json');
    this.learningDataSeedPath = path.join(dataDir, 'learning-data.seed.json');
    this.patternsSeedPath = path.join(dataDir, 'patterns.seed.json');
  }

  /**
   * Record a user correction for learning
   */
  async recordCorrection(
    originalText: string,
    originalParsing: any,
    userCorrection: any,
    userId: string,
    confidence: number
  ): Promise<void> {
    return this.oneAtATime(() => this.storeCorrection(originalText, originalParsing, userCorrection, userId, confidence));
  }

  private async storeCorrection(
    originalText: string,
    originalParsing: any,
    userCorrection: any,
    userId: string,
    confidence: number
  ): Promise<void> {
    try {
      const learningEntry: LearningData = {
        originalText: originalText.toLowerCase(),
        originalParsing,
        userCorrection,
        userId,
        timestamp: new Date().toISOString(),
        confidence
      };

      // Load existing learning data
      const existingData = await this.loadLearningData(true);
      existingData.push(learningEntry);

      // Keep only last 1000 entries to prevent file from growing too large
      if (existingData.length > HISTORY_LIMIT) {
        existingData.splice(0, existingData.length - HISTORY_LIMIT);
      }

      await this.saveLearningData(existingData);
      await this.updatePatterns(learningEntry);

      logger.info('Learning data recorded successfully', {
        text: originalText.substring(0, 50),
        correction: userCorrection,
        userId: userId.substring(0, 8),
        confidence: confidence,
        dataFile: this.learningDataPath,
        totalEntries: existingData.length
      });
    } catch (error) {
      logger.error('Failed to record learning data', error as Error, {
        dataPath: this.learningDataPath,
        patternsPath: this.patternsPath,
        originalText: originalText.substring(0, 50),
        userId: userId.substring(0, 8)
      });
    }
  }

  /**
   * A record corrected into a starter category (FT-184): a phrase's words are counted, a payment's merchant is tied to
   * it. A lesson with nothing to teach changes nothing.
   */
  learnCategory(lesson: CategoryLesson): Promise<void> {
    if (!teachesAnything(lesson)) return Promise.resolve();
    return this.oneAtATime(async () => {
      try {
        const patterns = withLesson(await this.loadPatterns(true), lesson);
        const history = [...(await this.loadLearningData(true)), historyEntryOf(lesson, new Date().toISOString())]
          .slice(-HISTORY_LIMIT);
        await this.savePatterns(patterns);
        await this.saveLearningData(history);
        logger.info('Category lesson learned', {
          kind: lesson.kind, category: lesson.presetKey, userId: lesson.userId.substring(0, 8),
        });
      } catch (error) {
        logger.error('Failed to learn a category lesson', error as Error, { category: lesson.presetKey });
      }
    });
  }

  /** A record left the category it was corrected into (FT-184): every lesson it taught is taken back. */
  unlearnRecord(recordId: string): Promise<void> {
    return this.oneAtATime(async () => {
      try {
        const left = withoutLessonsOf(recordId, await this.loadPatterns(true), await this.loadLearningData(true));
        if (left.taken === 0) return;
        await this.savePatterns(left.patterns);
        await this.saveLearningData(left.history);
        logger.info('Category lessons taken back', { recordId, lessons: left.taken });
      } catch (error) {
        logger.error('Failed to take category lessons back', error as Error, { recordId });
      }
    });
  }

  /**
   * Get enhanced prompts based on learned patterns. Patterns name starter categories by key; they are
   * shown in the user's current names (`presetNames`), and a starter the user hid is left out.
   */
  async getEnhancedPrompts(basePrompt: string, presetNames?: Map<string, string>): Promise<string> {
    try {
      const patterns = await this.loadPatterns();
      
      // Words of corrections only once they give their category for sure (FT-184)
      const lessonWords = lessonWordsByCategory(patterns.words ?? [], true);
      if (!patterns.categories.length && !patterns.merchants.length && lessonWords.size === 0) {
        return basePrompt;
      }

      const categoryName = (key: string | undefined): string | undefined => {
        if (!key) return undefined;
        if (presetNames) return presetNames.get(key);
        return CATEGORY_PRESETS.find(preset => preset.key === key)?.name;
      };

      // A bare brand («yandex» of an old seed, FT-150) would tell the AI that «yandex plus» is transport too
      const shown = (words: string[]) => words.filter(word => !isBareBrand(word));

      let enhancement = '\n\nИЗУЧЕННЫЕ ПАТТЕРНЫ (используй для точной категоризации):\n';

      // Add learned category patterns
      if (patterns.categories.length > 0 || lessonWords.size > 0) {
        enhancement += '\nКАТЕГОРИИ:\n';
        patterns.categories
          .filter(p => p.usageCount >= MIN_PATTERN_USES)
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 20) // Top 20 patterns
          .forEach(pattern => {
            const name = categoryName(pattern.category);
            const keywords = shown(pattern.keywords);
            if (name && keywords.length > 0) enhancement += `• "${keywords.join('", "')}" → ${name}\n`;
          });
        lessonWords.forEach((words, key) => {
          const name = categoryName(key);
          if (name) enhancement += `• "${words.join('", "')}" → ${name}\n`;
        });
      }

      // Add learned merchant patterns
      if (patterns.merchants.length > 0) {
        enhancement += '\nМЕРЧАНТЫ:\n';
        patterns.merchants
          .filter(p => p.usageCount >= MIN_PATTERN_USES)
          .sort((a, b) => b.usageCount - a.usageCount)
          .slice(0, 15) // Top 15 merchants
          .forEach(pattern => {
            const aliases = shown(pattern.aliases);
            if (aliases.length === 0) return;
            enhancement += `• "${aliases.join('", "')}" → ${pattern.normalizedName}`;
            const name = categoryName(pattern.category);
            if (name) enhancement += ` (${name})`;
            enhancement += '\n';
          });
      }

      return basePrompt + enhancement;
    } catch (error) {
      logger.error('Failed to enhance prompts', error as Error);
      return basePrompt;
    }
  }

  /**
   * Learned words that name a starter category, by its key (FT-138): from the patterns the AI prompt shows,
   * the aliases of merchants with a category and those keywords of category patterns that point at it —
   * not «купил», «деньги» or a word two categories share (`namingWordsOf`); and the words corrections taught it at
   * least twice (FT-184, `MIN_WORD_LESSONS`).
   */
  async learnedCategoryWords(): Promise<Map<string, string[]>> {
    const patterns = await this.loadPatterns();
    const named = namingWordsOf({
      categories: patterns.categories
        .filter(pattern => pattern.usageCount >= MIN_PATTERN_USES)
        .map(pattern => ({ key: pattern.category, keywords: pattern.keywords })),
      merchants: patterns.merchants
        .filter(merchant => merchant.usageCount >= MIN_PATTERN_USES && merchant.category)
        .map(merchant => ({ key: merchant.category!, aliases: merchant.aliases })),
    });
    for (const [key, words] of lessonWordsByCategory(patterns.words ?? [], true)) {
      named.set(key, [...new Set([...(named.get(key) ?? []), ...words])]);
    }
    return named;
  }

  /** Words one correction taught a starter category (FT-184): they give it as a guess, «Продукты?». */
  async tentativeCategoryWords(): Promise<Map<string, string[]>> {
    return lessonWordsByCategory((await this.loadPatterns()).words ?? [], false);
  }

  /** Merchants corrections tied to a starter category, by `merchantKey` (FT-184): a payment there needs no AI. */
  async learnedMerchants(): Promise<Map<string, string>> {
    return merchantCategories((await this.loadPatterns()).merchants);
  }

  private async updatePatterns(learningEntry: LearningData): Promise<void> {
    const patterns = await this.loadPatterns(true);
    
    // Update category patterns
    if (learningEntry.userCorrection.category && 
        learningEntry.userCorrection.category !== learningEntry.originalParsing.category) {
      
      const words = learningEntry.originalText
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 2);
      
      const correctedCategory = learningEntry.userCorrection.category;
      
      // Find or create category pattern
      let categoryPattern = patterns.categories.find(p => p.category === correctedCategory);
      if (!categoryPattern) {
        categoryPattern = {
          keywords: [],
          category: correctedCategory,
          confidence: 0.5,
          usageCount: 0
        };
        patterns.categories.push(categoryPattern);
      }
      
      // Add new keywords from the text
      words.forEach(word => {
        if (!categoryPattern!.keywords.includes(word)) {
          categoryPattern!.keywords.push(word);
        }
      });
      
      categoryPattern.usageCount++;
      categoryPattern.confidence = Math.min(1.0, categoryPattern.confidence + 0.1);
    }
    
    // Update merchant patterns
    if (learningEntry.userCorrection.merchant) {
      const originalMerchant = learningEntry.originalParsing.merchant;
      const correctedMerchant = learningEntry.userCorrection.merchant;
      
      if (originalMerchant && originalMerchant !== correctedMerchant) {
        let merchantPattern = patterns.merchants.find(p => p.normalizedName === correctedMerchant);
        if (!merchantPattern) {
          merchantPattern = {
            aliases: [correctedMerchant.toLowerCase()],
            normalizedName: correctedMerchant,
            category: learningEntry.userCorrection.category,
            usageCount: 0
          };
          patterns.merchants.push(merchantPattern);
        }
        
        // Add original merchant as alias
        const originalLower = originalMerchant.toLowerCase();
        if (!merchantPattern.aliases.includes(originalLower)) {
          merchantPattern.aliases.push(originalLower);
        }
        
        merchantPattern.usageCount++;
        if (learningEntry.userCorrection.category) {
          merchantPattern.category = learningEntry.userCorrection.category;
        }
      }
    }
    
    await this.savePatterns(patterns);
  }

  private oneAtATime<T>(change: () => Promise<T>): Promise<T> {
    const next = this.changes.then(change, change);
    this.changes = next.catch(() => undefined);
    return next;
  }

  /** `forChange`: the read is followed by a write, so a broken file is kept beside it first. */
  private async loadLearningData(forChange = false): Promise<LearningData[]> {
    const data = await readLearningFile(this.learningDataPath, forChange);
    if (data !== undefined) return migrateLearningData(data as LearningData[]);
    const seed = await readLearningFile(this.learningDataSeedPath);
    return seed !== undefined ? migrateLearningData(seed as LearningData[]) : [];
  }

  private async saveLearningData(data: LearningData[]): Promise<void> {
    try {
      await writeLearningFile(this.learningDataPath, data);
    } catch (error) {
      logger.error('Failed to save learning data', error as Error);
    }
  }

  private async loadPatterns(forChange = false): Promise<LearnedPatterns> {
    const data = await readLearningFile(this.patternsPath, forChange);
    if (data !== undefined) return migratePatterns(data as LearnedPatterns);
    const seed = await readLearningFile(this.patternsSeedPath);
    return seed !== undefined ? migratePatterns(seed as LearnedPatterns) : { categories: [], merchants: [] };
  }

  private async savePatterns(patterns: LearnedPatterns): Promise<void> {
    try {
      await writeLearningFile(this.patternsPath, patterns);
    } catch (error) {
      logger.error('Failed to save patterns', error as Error);
    }
  }
}

/**
 * Patterns from before FT-099 name old static ids. They are mapped to starter keys when read and
 * written back that way on the next save; patterns that land on the same key are merged.
 */
export function migratePatterns(patterns: LearnedPatterns): LearnedPatterns {
  const byKey = new Map<string, CategoryPattern>();
  for (const pattern of patterns.categories ?? []) {
    const key = presetKeyForLearning(pattern.category);
    const merged = byKey.get(key);
    if (!merged) {
      byKey.set(key, { ...pattern, category: key, keywords: [...pattern.keywords] });
      continue;
    }
    for (const keyword of pattern.keywords) {
      if (!merged.keywords.includes(keyword)) merged.keywords.push(keyword);
    }
    merged.usageCount += pattern.usageCount;
    merged.confidence = Math.max(merged.confidence, pattern.confidence);
  }
  return {
    categories: [...byKey.values()],
    merchants: (patterns.merchants ?? []).map(merchant => ({
      ...merchant,
      category: merchant.category ? presetKeyForLearning(merchant.category) : merchant.category,
    })),
    words: patterns.words ?? [],
  };
}

/** Learning history from before FT-099: category values become starter keys. */
export function migrateLearningData(entries: LearningData[]): LearningData[] {
  return entries.map(entry => ({
    ...entry,
    originalParsing: { ...entry.originalParsing, category: presetKeyForLearning(entry.originalParsing.category) },
    userCorrection: entry.userCorrection.category
      ? { ...entry.userCorrection, category: presetKeyForLearning(entry.userCorrection.category) }
      : entry.userCorrection,
  }));
}

// Singleton instance
export const transactionLearning = new TransactionLearningService();