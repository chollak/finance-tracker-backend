import fs from 'fs';
import { VoiceInput } from '../domain/voiceInput';
import { ProcessedTransaction } from '../domain/processedTransaction';
import { OpenAITranscriptionService } from '../infrastructure/openAITranscriptionService';
import { CreateTransactionUseCase } from '../../transaction/application/createTransaction';
import { Transaction } from '../../transaction/domain/transactionEntity';

export class ProcessVoiceInputUseCase {
    constructor(
        private openAIService: OpenAITranscriptionService,
        private createTransactionUseCase: CreateTransactionUseCase
    ) {}

    async execute(input: VoiceInput): Promise<ProcessedTransaction> {
        const fileExt = '.mp3';
        const newFilePath = input.filePath + fileExt;
        fs.renameSync(input.filePath, newFilePath);

        const recognizedText = await this.openAIService.transcribe(newFilePath);
        const { amount, category, type } = await this.openAIService.analyzeText(recognizedText);

        const transaction: Transaction = {
            date: new Date().toISOString(),
            category,
            description: recognizedText,
            amount,
            type,
        };

        await this.createTransactionUseCase.execute(transaction);
        fs.unlinkSync(newFilePath);

        return { text: recognizedText, amount, category, type };
    }
}
