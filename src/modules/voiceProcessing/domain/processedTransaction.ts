export interface DetectedTransaction {
    id: string;
    amount: number;
    category: string;
    type: 'income' | 'expense';
    date: string;
    merchant?: string;
    confidence?: number;
    description?: string;
}

export interface ProcessedTransaction {
    text: string;
    transactions: DetectedTransaction[];
}
