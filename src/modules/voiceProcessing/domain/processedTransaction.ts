export interface DetectedTransaction {
    id: string;
    amount: number;
    category: string;
    type: 'income' | 'expense';
    date: string;
}

export interface ProcessedTransaction {
    text: string;
    transactions: DetectedTransaction[];
}
