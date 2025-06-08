import { ProcessedTransaction } from '../domain/processedTransaction';
import { OpenAITranscriptionService } from '../infrastructure/openAITranscriptionService';
import { CreateTransactionUseCase } from '../../transaction/application/createTransaction';
import { Transaction } from '../../transaction/domain/transactionEntity';

export class ProcessTextInputUseCase {
    constructor(
        private openAIService: OpenAITranscriptionService,
        private createTransactionUseCase: CreateTransactionUseCase
    ) {}

    async execute(text: string): Promise<ProcessedTransaction> {
        const { amount, category, type } = await this.openAIService.analyzeText(text);

        const transaction: Transaction = {
            date: new Date().toISOString(),
            category,
            description: text,
            amount,
            type,
        };

        await this.createTransactionUseCase.execute(transaction);

        return { text, amount, category, type };
    }
}
