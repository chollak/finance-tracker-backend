export interface Transaction {
    date: string;
    category: string;
    description: string;
    amount: number;
    type: 'income' | 'expense';  // Тип транзакции
    userId: string;
    userName?: string;
}
