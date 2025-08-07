export interface Transaction {
    id?: string;
    date: string;
    category: string;
    description: string;
    amount: number;
    type: 'income' | 'expense';  // Тип транзакции
    userId: string;
    userName?: string;
    // Enhanced fields for learning
    merchant?: string;
    confidence?: number;
    originalText?: string; // Original voice/text input for learning
    originalParsing?: {
        amount: number;
        category: string;
        type: 'income' | 'expense';
        merchant?: string;
        confidence?: number;
    };
}
