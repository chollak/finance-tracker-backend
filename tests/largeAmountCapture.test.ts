import 'reflect-metadata';
import fs from 'fs/promises';
import { TransactionModule } from '../src/modules/transaction/transactionModule';
import { SqliteTransactionRepository } from '../src/modules/transaction/infrastructure/persistence/SqliteTransactionRepository';
import { CategoryModule } from '../src/modules/category/categoryModule';
import { SqliteCategoryRepository } from '../src/modules/category/infrastructure/SqliteCategoryRepository';
import { AccountModule } from '../src/modules/account/accountModule';
import { SqliteAccountRepository } from '../src/modules/account/infrastructure/SqliteAccountRepository';
import { SqliteAccountMoveRepository } from '../src/modules/account/infrastructure/SqliteAccountMoveRepository';
import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { ProcessVoiceInputUseCase } from '../src/modules/voiceProcessing/application/processVoiceInput';
import { ParsedTransaction, TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { QuickCaptureService } from '../src/modules/quickCapture/application/quickCaptureService';
import { prepareDatabaseOnce, TestDatabase } from './helpers/testDatabase';

// ffmpeg is faked: a real one on fake audio is one more process per voice test (#295)
jest.mock('child_process', () => jest.requireActual('./helpers/fakeFfmpeg').childProcessWithFakeFfmpeg());

/**
 * #305: the rule of a suspiciously large amount (`largeAmount.ts`, FT-123) was the bot's alone — `POST
 * /api/quick-capture` wrote «кофе 25000000» as an ordinary record. Now the record of a phrase or a voice is written
 * with `needsReview`, on a real SQLite file with the real categories.
 */

const USER_ID = '7d0a5f0e-3a55-4d5a-9d0b-3050000000a1';
const DAY = '2026-11-18';

function item(fields: Partial<ParsedTransaction> & Pick<ParsedTransaction, 'amount' | 'category'>): ParsedTransaction {
  return { intent: 'transaction', type: 'expense', description: 'кофе', date: DAY, ...fields } as ParsedTransaction;
}

describe('a suspiciously large amount of a phrase or a voice is written to be checked (#305)', () => {
  const migrated = prepareDatabaseOnce();
  let db: TestDatabase;
  let transactionModule: TransactionModule;
  let parsed: ParsedTransaction[];
  let parser: TranscriptionService;

  beforeEach(async () => {
    db = await migrated.open();
    const categoryModule = new CategoryModule(new SqliteCategoryRepository(db.dataSource));
    const accountModule = new AccountModule(new SqliteAccountRepository(db.dataSource), undefined, new SqliteAccountMoveRepository(db.dataSource));
    transactionModule = new TransactionModule(new SqliteTransactionRepository(db.dataSource));
    transactionModule.setCategoryResolver(categoryModule.getCatalog());
    transactionModule.setAccountResolver(accountModule.getBook());
    parsed = [];
    parser = {
      analyzeInput: jest.fn(async () => ({ transactions: parsed, debts: [] })),
      analyzeTransactions: jest.fn(),
      transcribe: jest.fn(),
    } as unknown as TranscriptionService;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await db.close();
  });

  function quickCapture(): QuickCaptureService {
    return new QuickCaptureService(new ProcessTextInputUseCase(parser, transactionModule.getCreateTransactionUseCase()));
  }

  async function stored(id: string) {
    const found = await transactionModule.getGetTransactionByIdUseCase().execute(id);
    if (!found.success) throw found.error;
    return found.data;
  }

  it('«кофе 25000000» through quick capture is `needs_review`, and the record is stored so', async () => {
    parsed = [item({ amount: 25_000_000, category: 'Кафе' })];

    const result = await quickCapture().capture({ text: 'кофе 25000000', userId: USER_ID, source: 'ios_shortcut' });

    expect(result.status).toBe('needs_review');
    expect(result.review.reasons).toEqual(['transaction_needs_review']);
    expect(result.transactions).toEqual([expect.objectContaining({ amountMinor: 2_500_000_000, needsReview: true })]);
    expect((await stored(result.transactions[0].id)).needsReview).toBe(true);
  });

  it('flags only the large record of a phrase with several', async () => {
    parsed = [
      item({ amount: 25_000_000, category: 'Кафе' }),
      item({ amount: 18_000, category: 'Транспорт', description: 'такси' }),
    ];

    const result = await quickCapture().capture({ text: 'кофе 25000000, такси 18000', userId: USER_ID, source: 'miniapp' });

    expect(result.status).toBe('needs_review');
    expect(result.transactions.map(transaction => transaction.needsReview)).toEqual([true, false]);
  });

  it('leaves what the rule does not name as it was: below 10 000 000, not everyday spending, income', async () => {
    for (const [text, fields] of [
      ['банкет 9999999', item({ amount: 9_999_999, category: 'Кафе', description: 'банкет' })],
      ['диван 25000000', item({ amount: 25_000_000, category: 'Покупки', description: 'диван' })],
      ['зарплата 25000000', item({ amount: 25_000_000, category: 'Зарплата', description: 'зарплата', type: 'income' })],
    ] as const) {
      parsed = [fields];

      const result = await quickCapture().capture({ text, userId: USER_ID, source: 'ios_shortcut' });

      expect([text, result.status]).toEqual([text, 'saved']);
      expect(result.transactions[0].needsReview).toBe(false);
    }
  });

  it('an answer to «Сколько?» with a large amount is written to be checked too', async () => {
    const result = await quickCapture().captureWithAmount({
      item: { description: 'кофе', category: 'Кафе', type: 'expense', date: DAY },
      answer: { text: '25000000', amount: 25_000_000, currency: 'UZS' },
      userId: USER_ID,
      source: 'telegram',
    });

    expect(result.status).toBe('needs_review');
    expect((await stored(result.transactions[0].id)).needsReview).toBe(true);
  });

  it('a voice message is written the same way', async () => {
    jest.spyOn(fs, 'access').mockResolvedValue(undefined);
    jest.spyOn(fs, 'rename').mockResolvedValue(undefined);
    jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);
    (parser.transcribe as jest.Mock).mockResolvedValue('кофе двадцать пять миллионов');
    parsed = [item({ amount: 25_000_000, category: 'Кафе' })];
    const useCase = new ProcessVoiceInputUseCase(parser, transactionModule.getCreateTransactionUseCase());

    const result = await useCase.execute({ filePath: '/nowhere/voice.ogg', userId: USER_ID, source: 'telegram' });

    expect(result.transactions).toEqual([expect.objectContaining({ amountMinor: 2_500_000_000, needsReview: true })]);
    expect((await stored(result.transactions[0].id)).needsReview).toBe(true);
  });
});
