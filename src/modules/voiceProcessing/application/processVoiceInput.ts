import fs from 'fs/promises';
import { spawn } from 'child_process';
import { VoiceInput } from '../domain/voiceInput';
import { ProcessedTransaction, DetectedTransaction, DetectedDebt } from '../domain/processedTransaction';
import { TranscriptionService } from '../domain/transcriptionService';
import { CreateTransactionUseCase } from '../../transaction/application/createTransaction';
import { CreateDebtUseCase } from '../../debt/application/createDebt';
import { Transaction } from '../../transaction/domain/transactionEntity';
import { DebtType } from '../../debt/domain/debtEntity';
import { DebtLimitExceededError } from '../../debt/domain/errors';
import { ErrorFactory } from '../../../shared/domain/errors/AppError';
import { Validators } from '../../../shared/application/validation/validators';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { normalizeSemanticType } from '../../transaction/domain/transactionSemanticType';
import { UserCategorySource } from '../domain/categoryPrompt';
import { analysisContextFor, learnedWordsFor } from './processTextInput';
import { detectPaymentHints } from '../domain/paymentHints';
import { ResolvedAccount } from '../../transaction/domain/accountResolver';
import { ResolvedCategory } from '../../transaction/domain/categoryResolver';
import { LearnedCategoryWords, recordWordsOf } from '../domain/categoryGuess';
import { captureAssumptions } from './captureAssumptions';
import { captureMoneyOf } from './captureMoney';
import { fromMinor } from '../../../shared/domain/money/money';
import { NoSpeechDetectedError } from '../domain/voiceErrors';
import { itemClientId } from '../../transaction/domain/clientId';
import { todayDateOnly } from '../../../shared/domain/dates/dateOnly';

const logger = getLogger(LogCategory.OPENAI);

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
export async function removeVoiceFile(file: string): Promise<void> {
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
  constructor(
    private openAIService: TranscriptionService,
    private createTransactionUseCase: CreateTransactionUseCase,
    // Debt parsing is off (decision Д2): the parser no longer reports debts
    private createDebtUseCase?: CreateDebtUseCase,
    private categorySource?: UserCategorySource,
    /** Learned words, so a category a learned pattern gives is not called a guess (FT-138). */
    private learnedWords?: LearnedCategoryWords
  ) {}

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

      const transactionResults: DetectedTransaction[] = [];
      const debtResults: DetectedDebt[] = [];
      // «нал», «картой», «$» in what was said: which account and currency (FT-103)
      const hints = detectPaymentHints(recognizedText);
      // Named without an amount: nothing is written for them, the bot asks «Сколько?» (FT-123). They are
      // items of what was said all the same: «нал» of an unpriced taxi is not the coffee's
      const withoutAmount = parsed.withoutAmount ?? [];
      const itemCount = parsed.transactions.length + withoutAmount.length;

      // Log if nothing found
      if (parsed.transactions.length === 0 && parsed.debts.length === 0) {
        logger.warn('No transactions or debts found in voice input', {
          recognizedText: recognizedText.substring(0, 100),
          withoutAmount: withoutAmount.length,
        });
        return { text: recognizedText, transactions: [], debts: [], ...(withoutAmount.length ? { withoutAmount } : {}) };
      }

      // Every category here is the AI's choice; it is a guess unless the words name it (FT-138)
      const learned = parsed.transactions.length > 0 ? await learnedWordsFor(this.learnedWords) : new Map<string, readonly string[]>();

      // Process transactions
      for (const [index, p] of parsed.transactions.entries()) {
        try {
          const type = p.type === 'income' ? 'income' : 'expense';
          const semanticType = normalizeSemanticType(p.semanticType, type);
          const needsReview = p.needsReview === true;
          const money = captureMoneyOf(p, recognizedText, hints, itemCount, semanticType);
          const { currency } = money;
          const transaction: Transaction = {
            date: p.date || today,
            category: p.category || 'Другое',
            description: p.description || recognizedText.substring(0, 500),
            amount: money.amount,
            currency,
            source: input.source ?? 'miniapp',
            type,
            semanticType,
            needsReview,
            userId: input.userId.trim(),
            userName: input.userName?.trim() || input.userId.trim(),
            merchant: p.merchant,
            confidence: p.confidence,
            originalText: recognizedText,
            ...(input.clientId ? { clientId: itemClientId(input.clientId, index) } : {}),
            originalParsing: {
              amount: money.amount,
              category: p.category || 'Другое',
              type,
              semanticType,
              needsReview,
              merchant: p.merchant,
              confidence: p.confidence,
            },
          };

          // The parser chooses the category automatically, so never a hidden one (FT-099), and the
          // account from the wording (FT-103); moving own money is not paid «налом»
          let account: ResolvedAccount | undefined;
          let category: ResolvedCategory | undefined;
          const createResult = await this.createTransactionUseCase.execute(transaction, {
            visibleCategoriesOnly: true,
            accountHint: { text: money.accountText, kind: money.kind },
            allowCurrencyMismatch: true,
            onResolved: resolved => { account = resolved.account; category = resolved.category; },
          });
          if (createResult.success) {
            transactionResults.push({
              id: createResult.data,
              amount: transaction.amountMinor !== undefined ? fromMinor(transaction.amountMinor) : transaction.amount,
              amountMinor: transaction.amountMinor,
              currency: transaction.currency,
              accountId: transaction.accountId,
              accountName: account?.name,
              assumptions: captureAssumptions({
                text: recognizedText,
                amount: transaction.amount,
                category: {
                  name: transaction.category,
                  type: transaction.type,
                  presetKey: category?.presetKey ?? null,
                  chosenBy: 'ai',
                  words: recordWordsOf(recognizedText, p, itemCount),
                  learnedWords: category?.presetKey ? learned.get(category.presetKey) : undefined,
                },
                account,
                currency,
              }),
              category: transaction.category,
              categoryId: transaction.categoryId,
              type: transaction.type,
              semanticType: transaction.semanticType,
              needsReview: transaction.needsReview,
              date: transaction.date,
              merchant: transaction.merchant,
              confidence: transaction.confidence,
              description: transaction.description,
            });
          } else {
            logger.error('Failed to create transaction', null, { error: createResult.error?.message });
          }
        } catch (transactionError) {
          logger.error('Failed to create transaction from voice input', transactionError as Error, {
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
                // Only report a real linked transaction id when the debt result provides one.
                linkedTransactionId: result.data.relatedTransactionId,
              });
            } else {
              // Re-throw DebtLimitExceededError to show user-friendly message
              if (result.error instanceof DebtLimitExceededError) {
                throw result.error;
              }
              logger.error('Failed to create debt', null, { error: result.error.message });
            }
          } catch (debtError) {
            // Re-throw DebtLimitExceededError to show user-friendly message
            if (debtError instanceof DebtLimitExceededError) {
              throw debtError;
            }
            logger.error('Failed to create debt from voice input', debtError as Error, {
              debtData: d,
              userId: input.userId,
            });
          }
        }
      }

      return { text: recognizedText, transactions: transactionResults, debts: debtResults, ...(withoutAmount.length ? { withoutAmount } : {}) };
    } catch (error) {
      if (error instanceof Error && error.name.includes('Error')) {
        throw error;
      }

      throw ErrorFactory.businessLogic('Failed to process voice input', {
        originalError: error instanceof Error ? error.message : String(error),
        userId: input.userId,
      });
    } finally {
      // Both the voice and its .mp3, whichever is there: converted, both are; after a failed ffmpeg the voice was
      // renamed to the .mp3. A file left in uploads/ or downloads/ would stop live-update.sh (FT-216)
      await Promise.all([input.filePath, newFilePath].map(removeVoiceFile));
    }
  }
}
