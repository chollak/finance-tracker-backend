import fs from 'fs/promises';
import { spawn } from 'child_process';
import { VoiceInput } from '../domain/voiceInput';
import { ProcessedTransaction, DetectedTransaction, DetectedDebt } from '../domain/processedTransaction';
import { TranscriptionService } from '../domain/transcriptionService';
import { CreateTransactionUseCase } from '../../transaction/application/createTransaction';
import { CreateDebtUseCase } from '../../debt/application/createDebt';
import { Transaction } from '../../transaction/domain/transactionEntity';
import { DebtType } from '../../debt/domain/debtEntity';
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
          reject(
            ErrorFactory.externalService(
              'FFmpeg',
              new Error(`FFmpeg process exited with code ${code}, signal: ${signal}`)
            )
          );
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
    private createTransactionUseCase: CreateTransactionUseCase,
    private createDebtUseCase?: CreateDebtUseCase
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

      // Analyze text for transactions AND debts
      const parsed = await this.openAIService.analyzeInput(recognizedText);

      const transactionResults: DetectedTransaction[] = [];
      const debtResults: DetectedDebt[] = [];

      // Log if nothing found
      if (parsed.transactions.length === 0 && parsed.debts.length === 0) {
        console.warn('No transactions or debts found in voice input:', {
          recognizedText: recognizedText.substring(0, 100),
        });
        return { text: recognizedText, transactions: [], debts: [] };
      }

      // Process transactions
      for (const p of parsed.transactions) {
        try {
          const transaction: Transaction = {
            date: p.date || new Date().toISOString().split('T')[0],
            category: p.category || 'other',
            description: p.description || recognizedText.substring(0, 500),
            amount: p.amount || 0,
            type: p.type === 'income' ? 'income' : 'expense',
            userId: input.userId.trim(),
            userName: input.userName?.trim() || input.userId.trim(),
            merchant: p.merchant,
            confidence: p.confidence,
            originalText: recognizedText,
            originalParsing: {
              amount: p.amount || 0,
              category: p.category || 'other',
              type: p.type === 'income' ? 'income' : 'expense',
              merchant: p.merchant,
              confidence: p.confidence,
            },
          };

          const id = await this.createTransactionUseCase.execute(transaction);
          transactionResults.push({
            id,
            amount: transaction.amount,
            category: transaction.category,
            type: transaction.type,
            date: transaction.date,
            merchant: transaction.merchant,
            confidence: transaction.confidence,
            description: transaction.description,
          });
        } catch (transactionError) {
          console.error('Failed to create transaction from voice input:', {
            error: transactionError,
            transactionData: p,
            userId: input.userId,
          });
        }
      }

      // Process debts (if DebtModule is available)
      if (this.createDebtUseCase && parsed.debts.length > 0) {
        for (const d of parsed.debts) {
          try {
            const debtType = d.debtType === 'i_owe' ? DebtType.I_OWE : DebtType.OWED_TO_ME;

            const result = await this.createDebtUseCase.execute({
              userId: input.userId.trim(),
              type: debtType,
              personName: d.personName,
              amount: d.amount,
              description: d.description || recognizedText.substring(0, 500),
              dueDate: d.dueDate || undefined,
              moneyTransferred: d.moneyTransferred,
            });

            // Check if result was successful
            if (result.success) {
              debtResults.push({
                id: result.data.id!,
                debtType: d.debtType,
                personName: d.personName,
                amount: d.amount,
                dueDate: d.dueDate,
                description: d.description,
                confidence: d.confidence,
                // Transaction is created internally, we get the debt back
                linkedTransactionId: d.moneyTransferred ? result.data.id : undefined,
              });
            } else {
              console.error('Failed to create debt:', result.error.message);
            }
          } catch (debtError) {
            console.error('Failed to create debt from voice input:', {
              error: debtError,
              debtData: d,
              userId: input.userId,
            });
          }
        }
      }

      return { text: recognizedText, transactions: transactionResults, debts: debtResults };
    } catch (error) {
      if (error instanceof Error && error.name.includes('Error')) {
        throw error;
      }

      throw ErrorFactory.businessLogic('Failed to process voice input', {
        originalError: error instanceof Error ? error.message : String(error),
        userId: input.userId,
      });
    } finally {
      // Clean up files
      try {
        if (conversionAttempted) {
          await fs.unlink(newFilePath).catch(() => {});
        } else {
          await fs.unlink(input.filePath).catch(() => {});
        }
      } catch (cleanupError) {
        console.warn('Failed to cleanup voice files:', cleanupError);
      }
    }
  }
}
