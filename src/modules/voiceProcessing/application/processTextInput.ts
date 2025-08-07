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
                date: p.date || new Date().toISOString().split('T')[0],
                category: p.category || 'Другое',
                description: text,
                amount: p.amount || 0,
                type: p.type || 'expense',
                userId,
                userName,
                // Enhanced fields for learning
                merchant: p.merchant,
                confidence: p.confidence,
                originalText: text,
                originalParsing: {
                    amount: p.amount || 0,
                    category: p.category || 'Другое',
                    type: p.type || 'expense',
                    merchant: p.merchant,
                    confidence: p.confidence
                }
            };

            const id = await this.createTransactionUseCase.execute(transaction);
            results.push({ 
                id, 
                amount: transaction.amount, 
                category: transaction.category, 
                type: transaction.type, 
                date: transaction.date,
                merchant: transaction.merchant,
                confidence: transaction.confidence,
                description: transaction.description
            });
        }

        return { text, transactions: results };
    }
}
