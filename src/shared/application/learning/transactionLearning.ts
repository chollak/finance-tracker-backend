import fs from 'fs/promises';
import path from 'path';
import { createLogger, LogCategory } from '../logging';
import { CATEGORY_PRESETS, presetKeyForLearning } from '../../../modules/category/domain/categoryPresets';

const logger = createLogger(LogCategory.LEARNING);

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

export class TransactionLearningService {
  private learningDataPath: string;
  private patternsPath: string;
  private learningDataSeedPath: string;
  private patternsSeedPath: string;

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
      const existingData = await this.loadLearningData();
      existingData.push(learningEntry);

      // Keep only last 1000 entries to prevent file from growing too large
      if (existingData.length > 1000) {
        existingData.splice(0, existingData.length - 1000);
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

      let enhancement = '\n\nИЗУЧЕННЫЕ ПАТТЕРНЫ (используй для точной категоризации):\n';
      
      // Add learned category patterns
      if (patterns.categories.length > 0) {
        enhancement += '\nКАТЕГОРИИ:\n';
        patterns.categories
          .filter(p => p.usageCount >= 2) // Only include patterns used at least twice
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 20) // Top 20 patterns
          .forEach(pattern => {
            const name = categoryName(pattern.category);
            if (name) enhancement += `• "${pattern.keywords.join('", "')}" → ${name}\n`;
          });
      }

      // Add learned merchant patterns
      if (patterns.merchants.length > 0) {
        enhancement += '\nМЕРЧАНТЫ:\n';
        patterns.merchants
          .filter(p => p.usageCount >= 2)
          .sort((a, b) => b.usageCount - a.usageCount)
          .slice(0, 15) // Top 15 merchants
          .forEach(pattern => {
            enhancement += `• "${pattern.aliases.join('", "')}" → ${pattern.normalizedName}`;
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

  private async updatePatterns(learningEntry: LearningData): Promise<void> {
    const patterns = await this.loadPatterns();
    
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
      await fs.writeFile(this.learningDataPath, JSON.stringify(data, null, 2));
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
      await fs.writeFile(this.patternsPath, JSON.stringify(patterns, null, 2));
    } catch (error) {
      logger.error('Failed to save patterns', error as Error);
    }
  }
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