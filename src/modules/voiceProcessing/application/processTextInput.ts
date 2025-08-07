import { ProcessedTransaction, DetectedTransaction } from '../domain/processedTransaction';
import { TranscriptionService } from '../domain/transcriptionService';
import { CreateTransactionUseCase } from '../../transaction/application/createTransaction';
import { Transaction } from '../../transaction/domain/transactionEntity';

export class ProcessTextInputUseCase {
    constructor(
        private openAIService: TranscriptionService,
        private createTransactionUseCase: CreateTransactionUseCase
    ) {}

    async execute(text: string, userId: string, userName?: string): Promise<ProcessedTransaction> {
        const parsed = await this.openAIService.analyzeTransactions(text);

        const results: DetectedTransaction[] = [];

        // Ensure parsed is an array
        let transactions: any[] = [];
        if (Array.isArray(parsed)) {
            transactions = parsed;
        } else if (parsed && typeof parsed === 'object' && 'transactions' in parsed) {
            transactions = Array.isArray((parsed as any).transactions) ? (parsed as any).transactions : [];
        } else if (parsed) {
            transactions = [parsed];
        }

        if (transactions.length === 0) {
            console.warn('No transactions found in OpenAI response:', parsed);
            return { text, transactions: [] };
        }

        for (const p of transactions) {
            const transaction: Transaction = {
                date: p.date,
                category: p.category,
                description: text,
                amount: p.amount,
                type: p.type,
                userId,
                userName,
            };

            const id = await this.createTransactionUseCase.execute(transaction);
            results.push({ id, amount: p.amount, category: p.category, type: p.type, date: p.date });
        }

        return { text, transactions: results };
    }
}
