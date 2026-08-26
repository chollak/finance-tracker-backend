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

/**
 * Приводит дату транзакции к календарному дню YYYY-MM-DD.
 *
 * Колонка date сравнивается в SQL как строка, поэтому полный ISO
 * ('2026-08-26T12:00:00.000Z') не проходит условие date <= '2026-08-26'
 * и запись выпадает из любой выборки по диапазону дат.
 *
 * Два источника писали разные форматы: processTextInput клал YYYY-MM-DD,
 * быстрое добавление в боте — new Date().toISOString(). Нормализация стоит
 * в CreateTransactionUseCase, то есть на единственном входе для всех записей.
 */
export function normalizeTransactionDate(value?: string | Date): string {
    const today = (): string => new Date().toISOString().split('T')[0];

    if (!value) return today();

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? today() : value.toISOString().split('T')[0];
    }

    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? today() : parsed.toISOString().split('T')[0];
}
