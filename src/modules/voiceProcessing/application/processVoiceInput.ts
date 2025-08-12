import fs from 'fs/promises';
import { spawn } from 'child_process';
import { VoiceInput } from '../domain/voiceInput';
import { ProcessedTransaction, DetectedTransaction } from '../domain/processedTransaction';
import { TranscriptionService } from '../domain/transcriptionService';
import { CreateTransactionUseCase } from '../../transaction/application/createTransaction';
import { Transaction } from '../../transaction/domain/transactionEntity';
import { ErrorFactory } from '../../../shared/domain/errors/AppError';
import { Validators } from '../../../shared/application/validation/validators';

function convertOggToMp3(input: string, output: string): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            const ffmpeg = spawn('ffmpeg', ['-y', '-i', input, output]);
            
            ffmpeg.on('error', (err) => {
                reject(ErrorFactory.externalService('FFmpeg', err));
            });
            
            ffmpeg.on('close', (code, signal) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(ErrorFactory.externalService('FFmpeg', 
                        new Error(`FFmpeg process exited with code ${code}, signal: ${signal}`)
                    ));
                }
            });
        } catch (error) {
            reject(ErrorFactory.externalService('FFmpeg Setup', error instanceof Error ? error : undefined));
        }
    });
}

export class ProcessVoiceInputUseCase {
    constructor(
        private openAIService: TranscriptionService,
        private createTransactionUseCase: CreateTransactionUseCase
    ) {}

    async execute(input: VoiceInput): Promise<ProcessedTransaction> {
        // Input validation
        const filePathValidation = Validators.required(input.filePath, 'filePath');
        if (!filePathValidation.success) {
            throw filePathValidation.error;
        }

        const userIdValidation = Validators.required(input.userId, 'userId');
        if (!userIdValidation.success) {
            throw userIdValidation.error;
        }

        const fileExt = '.mp3';
        const newFilePath = input.filePath + fileExt;
        let conversionAttempted = false;

        try {
            // Check if input file exists
            try {
                await fs.access(input.filePath);
            } catch (error) {
                throw ErrorFactory.validation(`Voice file not found: ${input.filePath}`);
            }

            // Try to convert audio format
            try {
                await convertOggToMp3(input.filePath, newFilePath);
                conversionAttempted = true;
            } catch (ffmpegError) {
                console.warn('FFmpeg conversion failed, trying fallback rename:', ffmpegError);
                try {
                    // Fallback to simple rename if ffmpeg is unavailable
                    await fs.rename(input.filePath, newFilePath);
                } catch (renameError) {
                    throw ErrorFactory.externalService(
                        'Audio Conversion', 
                        new Error(`Both FFmpeg and rename failed. FFmpeg: ${ffmpegError}. Rename: ${renameError}`)
                    );
                }
            }

            // Transcribe audio to text
            const recognizedText = await this.openAIService.transcribe(newFilePath);
            
            if (!recognizedText || recognizedText.trim().length === 0) {
                throw ErrorFactory.externalService('Voice Transcription', new Error('No speech detected in audio'));
            }

            // Analyze text for transactions
            const parsed = await this.openAIService.analyzeTransactions(recognizedText);

            const results: DetectedTransaction[] = [];

            // Normalize parsed response to array
            let transactions: any[] = [];
            if (Array.isArray(parsed)) {
                transactions = parsed;
            } else if (parsed && typeof parsed === 'object' && 'transactions' in parsed) {
                transactions = Array.isArray((parsed as any).transactions) ? (parsed as any).transactions : [];
            } else if (parsed && typeof parsed === 'object') {
                transactions = [parsed];
            }

            // Log if no transactions found for debugging
            if (transactions.length === 0) {
                console.warn('No transactions found in voice input:', {
                    recognizedText: recognizedText.substring(0, 100),
                    parsedResponse: JSON.stringify(parsed).substring(0, 200)
                });
                return { text: recognizedText, transactions: [] };
            }

            // Process each transaction
            for (const p of transactions) {
                try {
                    const transaction: Transaction = {
                        date: p.date || new Date().toISOString().split('T')[0],
                        category: p.category || 'Другое',
                        description: recognizedText.substring(0, 500), // Limit description length
                        amount: parseFloat(p.amount) || 0,
                        type: p.type === 'income' ? 'income' : 'expense',
                        userId: input.userId.trim(),
                        userName: input.userName?.trim() || input.userId.trim(),
                        // Enhanced fields for learning
                        merchant: p.merchant,
                        confidence: p.confidence,
                        originalText: recognizedText,
                        originalParsing: {
                            amount: parseFloat(p.amount) || 0,
                            category: p.category || 'Другое',
                            type: p.type === 'income' ? 'income' : 'expense',
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
                } catch (transactionError) {
                    console.error('Failed to create transaction from voice input:', {
                        error: transactionError,
                        transactionData: p,
                        userId: input.userId
                    });
                    // Continue processing other transactions instead of failing completely
                }
            }

            return { text: recognizedText, transactions: results };

        } catch (error) {
            // Re-throw our own errors
            if (error instanceof Error && error.name.includes('Error')) {
                throw error;
            }
            
            // Wrap unknown errors
            throw ErrorFactory.businessLogic('Failed to process voice input', { 
                originalError: error instanceof Error ? error.message : String(error),
                userId: input.userId 
            });
        } finally {
            // Clean up files
            try {
                if (conversionAttempted) {
                    await fs.unlink(newFilePath).catch(() => {});
                } else {
                    // If conversion wasn't attempted, the original file might still exist
                    await fs.unlink(input.filePath).catch(() => {});
                }
            } catch (cleanupError) {
                console.warn('Failed to cleanup voice files:', cleanupError);
            }
        }
    }
}
