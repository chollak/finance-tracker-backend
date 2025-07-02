import fs from 'fs/promises';
import { spawn } from 'child_process';
import { VoiceInput } from '../domain/voiceInput';
import { ProcessedTransaction } from '../domain/processedTransaction';
import { TranscriptionService } from '../domain/transcriptionService';
import { CreateTransactionUseCase } from '../../transaction/application/createTransaction';
import { Transaction } from '../../transaction/domain/transactionEntity';

function convertOggToMp3(input: string, output: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', ['-y', '-i', input, output]);
        ffmpeg.on('error', reject);
        ffmpeg.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error(`ffmpeg exited with code ${code}`));
        });
    });
}

export class ProcessVoiceInputUseCase {
    constructor(
        private openAIService: TranscriptionService,
        private createTransactionUseCase: CreateTransactionUseCase
    ) {}

    async execute(input: VoiceInput): Promise<ProcessedTransaction> {
        const fileExt = '.mp3';
        const newFilePath = input.filePath + fileExt;

        try {
            await convertOggToMp3(input.filePath, newFilePath);
        } catch {
            // fallback to simple rename if ffmpeg is unavailable
            await fs.rename(input.filePath, newFilePath);
        }

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
