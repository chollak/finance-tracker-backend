export interface ProcessedTransaction {
    text: string;
    amount: number;
    category: string;
    type: 'income' | 'expense';
}
