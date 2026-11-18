import fs from 'fs/promises';
import { spawn } from 'child_process';
import { VoiceInput } from '../domain/voiceInput';
import { ProcessedTransaction } from '../domain/processedTransaction';
import { TranscriptionService } from '../domain/transcriptionService';
import { CreateTransactionUseCase } from '../../transaction/application/createTransaction';
import { CreateDebtUseCase } from '../../debt/application/createDebt';
import { ErrorFactory } from '../../../shared/domain/errors/AppError';
import { Validators } from '../../../shared/application/validation/validators';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { UserCategorySource } from '../domain/categoryPrompt';
import { analysisContextFor, learnedWordsFor } from './processTextInput';
import { LearnedCategoryWords } from '../domain/categoryGuess';
import { ParsedRecordWriter } from './writeParsedRecords';
import { NoSpeechDetectedError } from '../domain/voiceErrors';
import { todayDateOnly } from '../../../shared/domain/dates/dateOnly';

const logger = getLogger(LogCategory.OPENAI);

/** The longest note a record takes (`Validators.description`). */
const MAX_NOTE_LENGTH = 500;

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

/** Removes a voice file if it is there; one already gone is fine. */
async function removeVoiceFile(file: string): Promise<void> {
  try {
    await fs.unlink(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn('Failed to remove a voice file', { error: (error as Error).message });
    }
  }
}

export interface ProcessVoiceOptions {
  /**
   * What was heard, before it is parsed into records. It returns true when the caller has used the text
   * itself (the bot's open «Сумму» question takes a spoken amount, FT-122); nothing is then parsed or
   * written.
   */
  takeHeardText?: (text: string) => Promise<boolean>;
}

export class ProcessVoiceInputUseCase {
  /** Writes what was read, as the text path does (#301). */
  private readonly writer: ParsedRecordWriter;

  constructor(
    private openAIService: TranscriptionService,
    createTransactionUseCase: CreateTransactionUseCase,
    // Debt parsing is off (decision Д2): the parser no longer reports debts
    createDebtUseCase?: CreateDebtUseCase,
    private categorySource?: UserCategorySource,
    /** Learned words, so a category a learned pattern gives is not called a guess (FT-138). */
    private learnedWords?: LearnedCategoryWords
  ) {
    this.writer = new ParsedRecordWriter(createTransactionUseCase, createDebtUseCase);
  }

  async execute(input: VoiceInput, options: ProcessVoiceOptions = {}): Promise<ProcessedTransaction> {
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
      } catch (ffmpegError) {
        logger.warn('FFmpeg conversion failed, trying fallback rename', { error: (ffmpegError as Error).message });
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
        throw new NoSpeechDetectedError();
      }

      if (options.takeHeardText && await options.takeHeardText(recognizedText)) {
        return { text: recognizedText, transactions: [], debts: [] };
      }

      // Analyze the text with the user's categories (FT-099), counting «вчера» from the day it was said (FT-182)
      const today = input.today ?? todayDateOnly();
      const parsed = await this.openAIService.analyzeInput(
        recognizedText,
        { ...(await analysisContextFor(this.categorySource, input.userId.trim())), today }
      );

      // Named without an amount: nothing is written for them, the bot asks «Сколько?» (FT-123)
      const withoutAmount = parsed.withoutAmount ?? [];

      // Log if nothing found: how much was heard, not the words (#269)
      if (parsed.transactions.length === 0 && parsed.debts.length === 0) {
        logger.warn('No transactions or debts found in voice input', {
          textLength: recognizedText.length,
          withoutAmount: withoutAmount.length,
        });
        return { text: recognizedText, transactions: [], debts: [], ...(withoutAmount.length ? { withoutAmount } : {}) };
      }

      // What was read is checked against what was heard and written by the code the text path writes with (#301).
      // Every category here is the AI's choice: a voice has no text fast paths (FT-138)
      const userId = input.userId.trim();
      return await this.writer.writeParsed(parsed, {
        text: recognizedText,
        input: 'voice',
        clientId: input.clientId,
        source: input.source,
        userId,
        userName: input.userName?.trim() || userId,
        fastPath: false,
        learned: parsed.transactions.length > 0 ? await learnedWordsFor(this.learnedWords) : new Map<string, readonly string[]>(),
        today,
        // What was heard can be longer than a note may be
        noteFallback: recognizedText.substring(0, MAX_NOTE_LENGTH),
      });
    } finally {
      // Both the voice and its .mp3, whichever is there: converted, both are; after a failed ffmpeg the voice was
      // renamed to the .mp3. A file left in the bot's downloads/ would stop live-update.sh (FT-216)
      await Promise.all([input.filePath, newFilePath].map(removeVoiceFile));
    }
  }
}
