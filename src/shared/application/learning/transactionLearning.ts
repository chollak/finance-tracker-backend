import fs from 'fs/promises';
import path from 'path';

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

  constructor() {
    const dataDir = path.join(process.cwd(), 'data');
    this.learningDataPath = path.join(dataDir, 'learning-data.json');
    this.patternsPath = path.join(dataDir, 'patterns.json');
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
      
      console.log('✅ LEARNING: Data recorded successfully', {
        text: originalText.substring(0, 50),
        correction: userCorrection,
        userId: userId.substring(0, 8),
        confidence: confidence,
        dataFile: this.learningDataPath,
        totalEntries: existingData.length
      });
    } catch (error) {
      console.error('❌ LEARNING: Failed to record learning data:', error);
      console.error('❌ LEARNING: Context:', {
        dataPath: this.learningDataPath,
        patternsPath: this.patternsPath,
        originalText: originalText.substring(0, 50),
        userId: userId.substring(0, 8)
      });
    }
  }

  /**
   * Get enhanced prompts based on learned patterns
   */
  async getEnhancedPrompts(basePrompt: string): Promise<string> {
    try {
      const patterns = await this.loadPatterns();
      
      if (!patterns.categories.length && !patterns.merchants.length) {
        return basePrompt;
      }

      let enhancement = '\n\nИЗУЧЕННЫЕ ПАТТЕРНЫ (используй для точной категоризации):\n';
      
      // Add learned category patterns
      if (patterns.categories.length > 0) {
        enhancement += '\nКАТЕГОРИИ:\n';
        patterns.categories
          .filter(p => p.usageCount >= 2) // Only include patterns used at least twice
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 20) // Top 20 patterns
          .forEach(pattern => {
            enhancement += `• "${pattern.keywords.join('", "')}" → ${pattern.category}\n`;
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
            if (pattern.category) enhancement += ` (${pattern.category})`;
            enhancement += '\n';
          });
      }

      return basePrompt + enhancement;
    } catch (error) {
      console.error('Failed to enhance prompts:', error);
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
      return JSON.parse(data);
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
      console.error('Failed to save learning data:', error);
    }
  }

  private async loadPatterns(): Promise<{categories: CategoryPattern[], merchants: MerchantPattern[]}> {
    try {
      const data = await fs.readFile(this.patternsPath, 'utf-8');
      return JSON.parse(data);
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
      console.error('Failed to save patterns:', error);
    }
  }
}

// Singleton instance
export const transactionLearning = new TransactionLearningService();