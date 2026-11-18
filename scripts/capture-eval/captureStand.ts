import 'reflect-metadata';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { createAppDataSource } from '../../src/shared/infrastructure/database/database.config';
import { runMigrationsWithBackup } from '../../src/shared/infrastructure/database/migrationRunner';
import { SqliteTransactionRepository } from '../../src/modules/transaction/infrastructure/persistence/SqliteTransactionRepository';
import { CreateTransactionUseCase } from '../../src/modules/transaction/application/createTransaction';
import { CategoryCatalog } from '../../src/modules/category/application/categoryCatalog';
import { SqliteCategoryRepository } from '../../src/modules/category/infrastructure/SqliteCategoryRepository';
import { AccountBook } from '../../src/modules/account/application/accountBook';
import { SqliteAccountRepository } from '../../src/modules/account/infrastructure/SqliteAccountRepository';
import { ProcessTextInputUseCase } from '../../src/modules/voiceProcessing/application/processTextInput';
import { ProcessVoiceInputUseCase } from '../../src/modules/voiceProcessing/application/processVoiceInput';
import { ProcessedTransaction } from '../../src/modules/voiceProcessing/domain/processedTransaction';
import { TranscriptionService } from '../../src/modules/voiceProcessing/domain/transcriptionService';
import { LearnedCategoryWords } from '../../src/modules/voiceProcessing/domain/categoryGuess';
import { CaptureOutcome } from './phraseSet';

/** The second account of the stand's user, next to the starter «Карта»: where «нал» goes. */
export const CASH_ACCOUNT_NAME = 'Наличные';

export interface CaptureStand {
  /**
   * The phrase written the way the bot, the Mini App and the iOS app write one — the text fast paths, then `ai`,
   * then the real record with its category and account — for a new user with the starter categories, «Карта» and
   * «Наличные». `today` is the day the phrase is said.
   */
  capture(phrase: string, ai: TranscriptionService, today: string): Promise<CaptureOutcome>;
  close(): Promise<void>;
}

/** The stand with the voice path next to the text one (#301). */
export interface VoiceCaptureStand extends CaptureStand {
  /**
   * The same phrase said to the bot (#301): a voice file whose transcription is the phrase, read by `ai` — a voice has
   * no text fast paths, the AI is always asked — and written by the voice use case for a user like `capture`'s.
   */
  captureVoice(phrase: string, ai: TranscriptionService, today: string): Promise<CaptureOutcome>;
}

/**
 * The text path on a fresh SQLite file in a temp directory, every migration applied, wired as `createModules()` wires
 * it. `learned` — the learned words of the fast path: the seed in the test, the copy's own in the eval.
 */
export async function openCaptureStand(learned: LearnedCategoryWords): Promise<VoiceCaptureStand> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-eval-'));
  const file = path.join(dir, 'db.sqlite');
  const dataSource = createAppDataSource(file);
  await dataSource.initialize();
  await runMigrationsWithBackup(dataSource, file, path.join(dir, 'backups'));

  const catalog = new CategoryCatalog(new SqliteCategoryRepository(dataSource));
  const accounts = new SqliteAccountRepository(dataSource);
  const book = new AccountBook(accounts);
  const create = new CreateTransactionUseCase(new SqliteTransactionRepository(dataSource), catalog, book);

  /** A user of its own, so no phrase sees another's records: the starter categories, «Карта» and «Наличные». */
  async function newUser(): Promise<string> {
    const userId = randomUUID();
    const [card] = await book.listForUser(userId);
    await accounts.createIfMissing({
      ...card, id: randomUUID(), name: CASH_ACCOUNT_NAME, kind: 'cash', currency: 'UZS', sortOrder: card.sortOrder + 10,
    });
    return userId;
  }

  return {
    async capture(phrase, ai, today) {
      const userId = await newUser();
      const useCase = new ProcessTextInputUseCase(ai, create, undefined, catalog, learned);
      return outcomeOf(await useCase.execute(phrase, userId, undefined, { source: 'miniapp', today }));
    },
    async captureVoice(phrase, ai, today) {
      const userId = await newUser();
      const filePath = path.join(dir, `${randomUUID()}.ogg`);
      fs.writeFileSync(filePath, 'voice');
      const heard: TranscriptionService = {
        transcribe: async () => phrase,
        analyzeTransactions: text => ai.analyzeTransactions(text),
        analyzeInput: (text, context) => ai.analyzeInput(text, context),
        categoryOfMerchant: (merchant, context) => ai.categoryOfMerchant(merchant, context),
      };
      const useCase = new ProcessVoiceInputUseCase(heard, create, undefined, catalog, learned);
      return outcomeOf(await useCase.execute({ filePath, userId, source: 'telegram', today }));
    },
    async close() {
      if (dataSource.isInitialized) await dataSource.destroy();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** What was written, as far as the set compares it. */
function outcomeOf(result: ProcessedTransaction): CaptureOutcome {
  return {
    records: result.transactions.map(record => ({
      type: record.type,
      semanticType: record.semanticType ?? record.type,
      amountMinor: record.amountMinor ?? Math.round(record.amount * 100),
      currency: record.currency ?? 'UZS',
      date: record.date,
      category: record.category,
      account: record.accountName ?? '',
      needsReview: record.needsReview === true,
    })),
    withoutAmount: (result.withoutAmount ?? []).map(item => ({
      description: item.description,
      category: item.category,
      type: item.type,
    })),
  };
}

/** A parser that fails the phrase if it is asked: a fast path was expected to read it. */
export function parserNeverAsked(): TranscriptionService {
  const refuse = async (): Promise<never> => {
    throw new Error('The AI was asked for a phrase a text fast path should read');
  };
  return { transcribe: refuse, analyzeTransactions: refuse, analyzeInput: refuse, categoryOfMerchant: refuse };
}
