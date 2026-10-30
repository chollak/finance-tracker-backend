import { TransactionSemanticType } from './transactionSemanticType';
import { RecordCurrency, RecordSource } from './recordSource';

export interface Transaction {
    id?: string;
    date: string;
    /**
     * On read: the current name of the record's category. On write (legacy, until FT-136): an old
     * static id, a name or an alias, resolved to `categoryId` by the category module (FT-099).
     */
    category: string;
    /** The user's category (FT-099). Always set on records read from the repository. */
    categoryId?: string;
    /** Pastel colour of the category, read with the record so old screens need no lookup (FT-100). */
    categoryColor?: string;
    /** The account the money moved on (FT-101). Always set on records read from the repository. */
    accountId?: string;
    /** Currency of the amount (FT-103): the account's when written; UZS for older records. */
    currency?: RecordCurrency;
    /** Where the record came from (FT-103); undefined for records written before. */
    source?: RecordSource;
    description: string;
    /**
     * Legacy amount in major units (сумы). Old writers send it and old screens read it; it is derived
     * from `amountMinor` on every read and removed in FT-136. New code works with `amountMinor`.
     */
    amount: number;
    /** Integer minor units (FT-097) — the stored amount. Always set on records read from the repository. */
    amountMinor?: number;
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
        /** The category the record was written to (FT-184); not on records written before it. */
        categoryId?: string;
    };
    // Archive support
    isArchived?: boolean;
    /** ISO moment of a soft delete (FT-105); only on deleted records, which reads leave out. */
    deletedAt?: string;
    /** The client's id for this record (FT-106): a repeated create returns the record instead of a new one. */
    clientId?: string;
    // Debt-related fields
    isDebtRelated?: boolean;
    relatedDebtId?: string;
    // Split expenses support (for future)
    splitGroupId?: string;
}

export function normalizeNeedsReview(value: unknown): boolean {
    return value === true;
}
