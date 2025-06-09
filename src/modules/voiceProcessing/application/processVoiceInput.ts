import fs from 'fs/promises';
import { VoiceInput } from '../domain/voiceInput';
import { ProcessedTransaction } from '../domain/processedTransaction';
import { TranscriptionService } from '../domain/transcriptionService';
import { CreateTransactionUseCase } from '../../transaction/application/createTransaction';
import { Transaction } from '../../transaction/domain/transactionEntity';

export class ProcessVoiceInputUseCase {
    constructor(
        private openAIService: TranscriptionService,
        private createTransactionUseCase: CreateTransactionUseCase
    ) {}

    async execute(input: VoiceInput): Promise<ProcessedTransaction> {
        const fileExt = '.mp3';
        const newFilePath = input.filePath + fileExt;
        await fs.rename(input.filePath, newFilePath);

        const recognizedText = await this.openAIService.transcribe(newFilePath);
        const { amount, category, type } = await this.openAIService.analyzeText(recognizedText);

        const transaction: Transaction = {
            date: new Date().toISOString(),
            category,
            description: recognizedText,
            amount,
            type,
            userId: input.userId,
            userName: input.userName,
        };

        await this.createTransactionUseCase.execute(transaction);
        await fs.unlink(newFilePath);

        return { text: recognizedText, amount, category, type };
    }
}
