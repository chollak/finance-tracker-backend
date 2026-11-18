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

/**
 * The text path on a fresh SQLite file in a temp directory, every migration applied, wired as `createModules()` wires
 * it. `learned` — the learned words of the fast path: the seed in the test, the copy's own in the eval.
 */
export async function openCaptureStand(learned: LearnedCategoryWords): Promise<CaptureStand> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-eval-'));
  const file = path.join(dir, 'db.sqlite');
  const dataSource = createAppDataSource(file);
  await dataSource.initialize();
  await runMigrationsWithBackup(dataSource, file, path.join(dir, 'backups'));

  const catalog = new CategoryCatalog(new SqliteCategoryRepository(dataSource));
  const accounts = new SqliteAccountRepository(dataSource);
  const book = new AccountBook(accounts);
  const create = new CreateTransactionUseCase(new SqliteTransactionRepository(dataSource), catalog, book);

  return {
    async capture(phrase, ai, today) {
      // A user of its own: no phrase sees another's records
      const userId = randomUUID();
      const [card] = await book.listForUser(userId);
      await accounts.createIfMissing({
        ...card, id: randomUUID(), name: CASH_ACCOUNT_NAME, kind: 'cash', currency: 'UZS', sortOrder: card.sortOrder + 10,
      });

      const useCase = new ProcessTextInputUseCase(ai, create, undefined, catalog, learned);
      const result = await useCase.execute(phrase, userId, undefined, { source: 'miniapp', today });
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
    },
    async close() {
      if (dataSource.isInitialized) await dataSource.destroy();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** A parser that fails the phrase if it is asked: a fast path was expected to read it. */
export function parserNeverAsked(): TranscriptionService {
  const refuse = async (): Promise<never> => {
    throw new Error('The AI was asked for a phrase a text fast path should read');
  };
  return { transcribe: refuse, analyzeTransactions: refuse, analyzeInput: refuse, categoryOfMerchant: refuse };
}
