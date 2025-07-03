import { ProcessedTransaction } from '../domain/processedTransaction';
import { TranscriptionService } from '../domain/transcriptionService';
import { CreateTransactionUseCase } from '../../transaction/application/createTransaction';
import { Transaction } from '../../transaction/domain/transactionEntity';

export class ProcessTextInputUseCase {
    constructor(
        private openAIService: TranscriptionService,
        private createTransactionUseCase: CreateTransactionUseCase
    ) {}

    async execute(text: string, userId: string, userName?: string): Promise<ProcessedTransaction> {
        const { amount, category, type } = await this.openAIService.analyzeText(text);

        const transaction: Transaction = {
            date: new Date().toISOString(),
            category,
            description: text,
            amount,
            type,
            userId,
            userName,
        };

        const id = await this.createTransactionUseCase.execute(transaction);

        return { text, amount, category, type, id };
    }
}
