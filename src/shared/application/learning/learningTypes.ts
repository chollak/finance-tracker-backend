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
  /** The words a phrase correction counted for its category (FT-184). */
  lessonWords?: string[];
  /** The merchant a payment correction tied to its category, by `merchantKey` (FT-184). */
  merchant?: string;
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

/** A word phrase corrections tied to a starter category, and how many of them (FT-184). */
export interface LearnedWord {
  word: string;
  /** Starter category key. */
  category: string;
  uses: number;
}

export interface LearnedPatterns {
  categories: CategoryPattern[];
  merchants: MerchantPattern[];
  /** Words of phrase corrections (FT-184), counted per word; files written before it have none. */
  words?: LearnedWord[];
}
