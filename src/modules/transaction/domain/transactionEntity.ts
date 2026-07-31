import { TransactionSemanticType } from './transactionSemanticType';

export interface Transaction {
    id?: string;
    date: string;
    category: string;
    description: string;
    amount: number;
    type: 'income' | 'expense';  // Тип транзакции (направление cashflow, legacy)
    semanticType?: TransactionSemanticType; // Смысл транзакции (для учёта расходов/бюджета)
    needsReview?: boolean; // Uncertain parsing/categorization, flagged for user correction
    userId: string;
    userName?: string;
    // Timestamps
    createdAt?: string; // ISO datetime string for time display
    // Enhanced fields for learning
    merchant?: string;
    confidence?: number;
    originalText?: string; // Original voice/text input for learning
    originalParsing?: {
        amount: number;
        category: string;
        type: 'income' | 'expense';
        semanticType?: TransactionSemanticType;
        needsReview?: boolean;
        merchant?: string;
        confidence?: number;
    };
    // Archive support
    isArchived?: boolean;
    // Debt-related fields
    isDebtRelated?: boolean;
    relatedDebtId?: string;
    // Split expenses support (for future)
    splitGroupId?: string;
}

export function normalizeNeedsReview(value: unknown): boolean {
    return value === true;
}
