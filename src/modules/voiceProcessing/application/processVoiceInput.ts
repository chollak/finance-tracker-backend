import fs from 'fs/promises';
import { spawn } from 'child_process';
import { VoiceInput } from '../domain/voiceInput';
import { ProcessedTransaction, DetectedTransaction } from '../domain/processedTransaction';
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
        const parsed = await this.openAIService.analyzeTransactions(recognizedText);

        const results: DetectedTransaction[] = [];

        for (const p of parsed) {
            const transaction: Transaction = {
                date: p.date,
                category: p.category,
                description: recognizedText,
                amount: p.amount,
                type: p.type,
                userId: input.userId,
                userName: input.userName,
            };

            const id = await this.createTransactionUseCase.execute(transaction);
            results.push({ id, amount: p.amount, category: p.category, type: p.type, date: p.date });
        }
        await fs.unlink(newFilePath);

        return { text: recognizedText, transactions: results };
    }
}
