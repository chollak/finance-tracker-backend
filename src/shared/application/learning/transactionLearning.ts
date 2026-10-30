import fs from 'fs/promises';
import path from 'path';
import { createLogger, LogCategory } from '../logging';
import { CATEGORY_PRESETS, presetKeyForLearning } from '../../../modules/category/domain/categoryPresets';
import { isBareBrand, namingWordsOf, wordsOf } from '../../../modules/voiceProcessing/domain/categoryGuess';
import { CategoryLesson, CategoryLessons } from '../../../modules/transaction/domain/categoryLessons';

const logger = createLogger(LogCategory.LEARNING);

/** A pattern counts once it has been used this many times: the AI prompt shows it, and it names a category (FT-138). */
export const MIN_PATTERN_USES = 2;

export interface LearningData {
  originalText: string;
  originalParsing: {
    amount: number;
    category: string;
    type: 'income' | 'expense';
    merchant?: string;
  };
  userCorrection: {
    amount?: number;
    category?: string;
    type?: 'income' | 'expense';
    merchant?: string;
  };
  userId: string;
  timestamp: string;
  confidence: number;
  /** The record a category correction came from (FT-184): taking the correction back finds it by the record. */
  recordId?: string;
  /** Words this correction added to its category pattern (FT-184): what taking the correction back removes. */
  learnedKeywords?: string[];
}

export interface CategoryPattern {
  keywords: string[];
  /** Starter category key (FT-099); files written before it hold old static ids, mapped on load. */
  category: string;
  confidence: number;
  usageCount: number;
}

export interface MerchantPattern {
  aliases: string[];
  normalizedName: string;
  category?: string;
  usageCount: number;
}

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
    await this.storeCorrection({
      originalText: originalText.toLowerCase(),
      originalParsing,
      userCorrection,
      userId,
      timestamp: new Date().toISOString(),
      confidence
    });
  }

  /** A record corrected into a starter category (FT-184): its words now point at it. */
  async learnCategory(lesson: CategoryLesson): Promise<void> {
    await this.storeCorrection({
      originalText: lesson.words.toLowerCase(),
      originalParsing: lesson.originalParsing,
      userCorrection: { category: lesson.presetKey },
      userId: lesson.userId,
      timestamp: new Date().toISOString(),
      confidence: lesson.originalParsing.confidence ?? 0.8,
      recordId: lesson.recordId,
    });
  }

  private storeCorrection(learningEntry: LearningData): Promise<void> {
    return this.oneAtATime(async () => {
      try {
        const learnedKeywords = await this.updatePatterns(learningEntry);

        // Load existing learning data
        const existingData = await this.loadLearningData();
        existingData.push(learnedKeywords.length > 0 ? { ...learningEntry, learnedKeywords } : learningEntry);

        // Keep only last 1000 entries to prevent file from growing too large
        if (existingData.length > 1000) {
          existingData.splice(0, existingData.length - 1000);
        }

        await this.saveLearningData(existingData);

        logger.info('Learning data recorded successfully', {
          text: learningEntry.originalText.substring(0, 50),
          correction: learningEntry.userCorrection,
          userId: learningEntry.userId.substring(0, 8),
          confidence: learningEntry.confidence,
          dataFile: this.learningDataPath,
          totalEntries: existingData.length
        });
      } catch (error) {
        logger.error('Failed to record learning data', error as Error, {
          dataPath: this.learningDataPath,
          patternsPath: this.patternsPath,
          originalText: learningEntry.originalText.substring(0, 50),
          userId: learningEntry.userId.substring(0, 8)
        });
      }
    });
  }

  /**
   * A record left the category it was corrected into (FT-184): «Отменить» in the Mini App, or a second correction.
   * The record's last correction into the category leaves the history, and so do the words it added to the pattern —
   * unless another correction of that category has them too, which then holds them. The seed's words stay, and a record
   * whose correction nobody recorded (an edit made before FT-184) takes nothing back.
   */
  unlearnCategory(lesson: CategoryLesson): Promise<void> {
    return this.oneAtATime(() => this.takeBack(lesson));
  }

  private async takeBack(lesson: CategoryLesson): Promise<void> {
    try {
      const history = await this.loadLearningData();
      const isTheLesson = (entry: LearningData) =>
        entry.recordId === lesson.recordId && entry.userCorrection.category === lesson.presetKey;
      const index = history.map(isTheLesson).lastIndexOf(true);
      if (index === -1) return;

      const taken = history[index];
      let rest = history.filter((_, position) => position !== index);
      const dropped: string[] = [];
      for (const word of taken.learnedKeywords ?? []) {
        const heir = rest.findIndex(entry =>
          entry.userCorrection.category === lesson.presetKey && lessonWords(entry.originalText).includes(word));
        if (heir === -1) {
          dropped.push(word);
          continue;
        }
        rest = rest.map((entry, position) => position === heir
          ? { ...entry, learnedKeywords: [...(entry.learnedKeywords ?? []), word] }
          : entry);
      }

      const patterns = await this.loadPatterns();
      const categories = patterns.categories
        .map(pattern => pattern.category === lesson.presetKey
          ? {
            ...pattern,
            keywords: pattern.keywords.filter(keyword => !dropped.includes(keyword)),
            usageCount: Math.max(0, pattern.usageCount - 1),
            confidence: Math.max(0.5, pattern.confidence - 0.1),
          }
          : pattern)
        .filter(pattern => pattern.keywords.length > 0 || pattern.usageCount > 0);

      await this.saveLearningData(rest);
      await this.savePatterns({ ...patterns, categories });
      logger.info('Learning taken back', { category: lesson.presetKey, dropped, userId: lesson.userId.substring(0, 8) });
    } catch (error) {
      logger.error('Failed to take learning back', error as Error, { category: lesson.presetKey });
    }
  }

  /**
   * Get enhanced prompts based on learned patterns. Patterns name starter categories by key; they are
   * shown in the user's current names (`presetNames`), and a starter the user hid is left out.
   */
  async getEnhancedPrompts(basePrompt: string, presetNames?: Map<string, string>): Promise<string> {
    try {
      const patterns = await this.loadPatterns();
      
      if (!patterns.categories.length && !patterns.merchants.length) {
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
      if (patterns.categories.length > 0) {
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
   * not «купил», «деньги» or a word two categories share (`namingWordsOf`).
   */
  async learnedCategoryWords(): Promise<Map<string, string[]>> {
    const patterns = await this.loadPatterns();
    return namingWordsOf({
      categories: patterns.categories
        .filter(pattern => pattern.usageCount >= MIN_PATTERN_USES)
        .map(pattern => ({ key: pattern.category, keywords: pattern.keywords })),
      merchants: patterns.merchants
        .filter(merchant => merchant.usageCount >= MIN_PATTERN_USES && merchant.category)
        .map(merchant => ({ key: merchant.category!, aliases: merchant.aliases })),
    });
  }

  /** Applies a correction to the patterns; returns the words it added to its category pattern. */
  private async updatePatterns(learningEntry: LearningData): Promise<string[]> {
    const patterns = await this.loadPatterns();
    const learnedKeywords: string[] = [];
    
    // Update category patterns
    if (learningEntry.userCorrection.category && 
        learningEntry.userCorrection.category !== learningEntry.originalParsing.category) {
      
      const words = lessonWords(learningEntry.originalText);
      
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
          learnedKeywords.push(word);
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
    return learnedKeywords;
  }

  private oneAtATime<T>(change: () => Promise<T>): Promise<T> {
    const next = this.changes.then(change, change);
    this.changes = next.catch(() => undefined);
    return next;
  }

  private async loadLearningData(): Promise<LearningData[]> {
    try {
      const data = await fs.readFile(this.learningDataPath, 'utf-8');
      return migrateLearningData(JSON.parse(data));
    } catch (error) {
      return this.loadSeedLearningData();
    }
  }

  private async loadSeedLearningData(): Promise<LearningData[]> {
    try {
      const data = await fs.readFile(this.learningDataSeedPath, 'utf-8');
      return migrateLearningData(JSON.parse(data));
    } catch (error) {
      return [];
    }
  }

  private async saveLearningData(data: LearningData[]): Promise<void> {
    try {
      const dir = path.dirname(this.learningDataPath);
      await fs.mkdir(dir, { recursive: true });
      await writeWhole(this.learningDataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error('Failed to save learning data', error as Error);
    }
  }

  private async loadPatterns(): Promise<LearnedPatterns> {
    try {
      const data = await fs.readFile(this.patternsPath, 'utf-8');
      return migratePatterns(JSON.parse(data));
    } catch (error) {
      return this.loadSeedPatterns();
    }
  }

  private async loadSeedPatterns(): Promise<LearnedPatterns> {
    try {
      const data = await fs.readFile(this.patternsSeedPath, 'utf-8');
      return migratePatterns(JSON.parse(data));
    } catch (error) {
      return { categories: [], merchants: [] };
    }
  }

  private async savePatterns(patterns: {categories: CategoryPattern[], merchants: MerchantPattern[]}): Promise<void> {
    try {
      const dir = path.dirname(this.patternsPath);
      await fs.mkdir(dir, { recursive: true });
      await writeWhole(this.patternsPath, JSON.stringify(patterns, null, 2));
    } catch (error) {
      logger.error('Failed to save patterns', error as Error);
    }
  }
}

/**
 * The words a correction teaches its category: every word of its text longer than two letters, without punctuation
 * and without numbers — an amount («50000», «25к») names no category.
 */
function lessonWords(text: string): string[] {
  return wordsOf(text).filter(word => word.length > 2 && !/\p{N}/u.test(word));
}

/**
 * Replaces a file in one step (FT-184): written beside it and renamed over it, so a reader never gets half a file —
 * which `loadPatterns` would take for no file and fall back to the seed.
 */
async function writeWhole(file: string, content: string): Promise<void> {
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, content);
  await fs.rename(temporary, file);
}

export interface LearnedPatterns {
  categories: CategoryPattern[];
  merchants: MerchantPattern[];
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