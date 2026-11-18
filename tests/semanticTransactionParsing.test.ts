import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { OpenAITranscriptionService } from '../src/modules/voiceProcessing/infrastructure/openAITranscriptionService';
import { ProcessVoiceInputUseCase } from '../src/modules/voiceProcessing/application/processVoiceInput';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';

// ffmpeg is faked: a real one on fake audio is one more process per voice test (#295)
jest.mock('child_process', () => jest.requireActual('./helpers/fakeFfmpeg').childProcessWithFakeFfmpeg());

/** Text and voice paths choose categories and accounts automatically (FT-099, FT-103). */
const AUTOMATIC = expect.objectContaining({ visibleCategoriesOnly: true, allowCurrencyMismatch: true });

describe('OpenAITranscriptionService transaction parsing - semanticType', () => {
  // Access the private parseTransactionItem method directly; no network calls are made.
  const service = new OpenAITranscriptionService('test-api-key') as unknown as {
    parseTransactionItem(item: any): { semanticType?: string; type: string } | null;
  };

  it('normalizes a valid semanticType returned by OpenAI', () => {
    const result = service.parseTransactionItem({
      intent: 'transaction',
      amount: 200000,
      category: 'other',
      type: 'expense',
      semanticType: 'own_transfer',
    });

    expect(result?.semanticType).toBe('own_transfer');
  });

  it('falls back to the legacy type when semanticType is missing', () => {
    const result = service.parseTransactionItem({
      intent: 'transaction',
      amount: 50000,
      category: 'salary',
      type: 'income',
    });

    expect(result?.semanticType).toBe('income');
  });

  it('falls back to the legacy type when semanticType is an unrecognized value', () => {
    const result = service.parseTransactionItem({
      intent: 'transaction',
      amount: 20000,
      category: 'food',
      type: 'expense',
      semanticType: 'crypto_trade',
    });

    expect(result?.semanticType).toBe('expense');
  });
});

describe('OpenAITranscriptionService transaction parsing - needsReview', () => {
  const service = new OpenAITranscriptionService('test-api-key') as unknown as {
    parseTransactionItem(item: any): { needsReview?: boolean } | null;
  };

  it('normalizes needsReview: true returned by OpenAI', () => {
    const result = service.parseTransactionItem({
      intent: 'transaction',
      amount: 100000,
      category: 'other',
      type: 'expense',
      needsReview: true,
    });

    expect(result?.needsReview).toBe(true);
  });

  it('defaults needsReview to false when missing', () => {
    const result = service.parseTransactionItem({
      intent: 'transaction',
      amount: 100000,
      category: 'other',
      type: 'expense',
    });

    expect(result?.needsReview).toBe(false);
  });

  it('defaults needsReview to false for a non-boolean value', () => {
    const result = service.parseTransactionItem({
      intent: 'transaction',
      amount: 100000,
      category: 'other',
      type: 'expense',
      needsReview: 'true',
    });

    expect(result?.needsReview).toBe(false);
  });
});

describe('ProcessVoiceInputUseCase - semanticType flow-through', () => {
  /** In a folder of this run: a fixed path in /tmp was shared by parallel Jest runs, which took each other's file (#250). */
  let dir: string;
  let filePath: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'semantic-voice-'));
    filePath = path.join(dir, 'input.ogg');
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await fs.writeFile(filePath, 'fake audio content');
  });

  afterEach(async () => {
    await fs.unlink(filePath).catch(() => {});
    await fs.unlink(filePath + '.mp3').catch(() => {});
  });

  it('passes semanticType from the transcription service through to the create payload and response', async () => {
    const openAIService = {
      transcribe: jest.fn().mockResolvedValue('снял наличные 100000'),
      analyzeInput: jest.fn().mockResolvedValue({
        transactions: [{
          intent: 'transaction',
          amount: 100000,
          category: 'other',
          type: 'expense',
          semanticType: 'cash_withdrawal',
          date: '2026-07-22',
          merchant: 'ATM',
        }],
        debts: [],
      }),
      analyzeTransactions: jest.fn(),
    } as unknown as TranscriptionService;

    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({ success: true, data: 'withdrawal-1' }),
    } as unknown as CreateTransactionUseCase;

    const useCase = new ProcessVoiceInputUseCase(openAIService, createTransactionUseCase);
    const result = await useCase.execute({ filePath, userId: 'user1', source: 'telegram' });

    expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
      semanticType: 'cash_withdrawal',
      originalParsing: expect.objectContaining({ semanticType: 'cash_withdrawal' }),
    }), AUTOMATIC);
    expect(result.transactions).toEqual([
      expect.objectContaining({ id: 'withdrawal-1', semanticType: 'cash_withdrawal' }),
    ]);
  });

  // Two values, so a source fixed in the use case would not pass: the bot's `telegram` and another one
  it.each(['telegram', 'ios_shortcut'] as const)('writes the source it is given, %s, on each record (#234)', async source => {
    const openAIService = {
      transcribe: jest.fn().mockResolvedValue('кофе 25000 и такси 18000'),
      analyzeInput: jest.fn().mockResolvedValue({
        transactions: [
          { intent: 'transaction', amount: 25000, category: 'Кафе', type: 'expense' },
          { intent: 'transaction', amount: 18000, category: 'Такси', type: 'expense' },
        ],
        debts: [],
      }),
      analyzeTransactions: jest.fn(),
    } as unknown as TranscriptionService;
    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({ success: true, data: 'voice-1' }),
    } as unknown as CreateTransactionUseCase;

    const useCase = new ProcessVoiceInputUseCase(openAIService, createTransactionUseCase);
    await useCase.execute({ filePath, userId: 'user1', source });

    const written = (createTransactionUseCase.execute as jest.Mock).mock.calls.map(([transaction]) => transaction.source);
    expect(written).toEqual([source, source]);
  });

  it('hands what was heard to the caller first; when the caller takes it, nothing is parsed or written (FT-122)', async () => {
    const openAIService = {
      transcribe: jest.fn().mockResolvedValue('150 тысяч'),
      analyzeInput: jest.fn(),
      analyzeTransactions: jest.fn(),
    } as unknown as TranscriptionService;
    const createTransactionUseCase = { execute: jest.fn() } as unknown as CreateTransactionUseCase;
    const takeHeardText = jest.fn().mockResolvedValue(true);

    const useCase = new ProcessVoiceInputUseCase(openAIService, createTransactionUseCase);
    const result = await useCase.execute({ filePath, userId: 'user1', source: 'telegram' }, { takeHeardText });

    expect(takeHeardText).toHaveBeenCalledWith('150 тысяч');
    expect(openAIService.analyzeInput).not.toHaveBeenCalled();
    expect(createTransactionUseCase.execute).not.toHaveBeenCalled();
    expect(result).toEqual({ text: '150 тысяч', transactions: [], debts: [] });
  });

  it('parses what was heard as usual when the caller does not take it', async () => {
    const openAIService = {
      transcribe: jest.fn().mockResolvedValue('такси 18000'),
      analyzeInput: jest.fn().mockResolvedValue({ transactions: [], debts: [] }),
      analyzeTransactions: jest.fn(),
    } as unknown as TranscriptionService;
    const createTransactionUseCase = { execute: jest.fn() } as unknown as CreateTransactionUseCase;

    const useCase = new ProcessVoiceInputUseCase(openAIService, createTransactionUseCase);
    await useCase.execute({ filePath, userId: 'user1', source: 'telegram' }, { takeHeardText: jest.fn().mockResolvedValue(false) });

    expect(openAIService.analyzeInput).toHaveBeenCalledWith('такси 18000', expect.anything());
  });

  it('normalizes a missing semanticType from the transcription service based on the legacy type', async () => {
    const openAIService = {
      transcribe: jest.fn().mockResolvedValue('зарплата 3000000'),
      analyzeInput: jest.fn().mockResolvedValue({
        transactions: [{
          intent: 'transaction',
          amount: 3000000,
          category: 'salary',
          type: 'income',
          date: '2026-07-22',
        }],
        debts: [],
      }),
      analyzeTransactions: jest.fn(),
    } as unknown as TranscriptionService;

    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({ success: true, data: 'salary-1' }),
    } as unknown as CreateTransactionUseCase;

    const useCase = new ProcessVoiceInputUseCase(openAIService, createTransactionUseCase);
    const result = await useCase.execute({ filePath, userId: 'user1', source: 'telegram' });

    expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
      semanticType: 'income',
    }), AUTOMATIC);
    expect(result.transactions).toEqual([
      expect.objectContaining({ id: 'salary-1', semanticType: 'income' }),
    ]);
  });

  it('propagates needsReview: true from the transcription service into the create payload and response', async () => {
    const openAIService = {
      transcribe: jest.fn().mockResolvedValue('непонятная транзакция 40000'),
      analyzeInput: jest.fn().mockResolvedValue({
        transactions: [{
          intent: 'transaction',
          amount: 40000,
          category: 'other',
          type: 'expense',
          date: '2026-07-22',
          needsReview: true,
        }],
        debts: [],
      }),
      analyzeTransactions: jest.fn(),
    } as unknown as TranscriptionService;

    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({ success: true, data: 'uncertain-1' }),
    } as unknown as CreateTransactionUseCase;

    const useCase = new ProcessVoiceInputUseCase(openAIService, createTransactionUseCase);
    const result = await useCase.execute({ filePath, userId: 'user1', source: 'telegram' });

    expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
      needsReview: true,
    }), AUTOMATIC);
    expect(result.transactions).toEqual([
      expect.objectContaining({ id: 'uncertain-1', needsReview: true }),
    ]);
  });

  // #301: after the AI a voice is checked and written by the code the text path uses (`ParsedRecordWriter`)
  describe('what was read is checked against what was heard, as a typed phrase is (#301)', () => {
    /** A voice heard as `heard` and read by the AI as `transactions`; what was sent to be written and what came back. */
    async function said(heard: string, transactions: object[], input: { userName?: string } = {}) {
      // A voice file is gone once it is read: a new one for each voice of a test
      await fs.writeFile(filePath, 'fake audio content');
      const openAIService = {
        transcribe: jest.fn().mockResolvedValue(heard),
        analyzeInput: jest.fn().mockResolvedValue({ transactions, debts: [] }),
        analyzeTransactions: jest.fn(),
      } as unknown as TranscriptionService;
      const execute = jest.fn().mockResolvedValue({ success: true, data: 'voice-1' });
      const useCase = new ProcessVoiceInputUseCase(openAIService, { execute } as unknown as CreateTransactionUseCase);

      const result = await useCase.execute({ filePath, userId: 'user1', source: 'telegram', ...input });

      return { result, sent: execute.mock.calls.map(([transaction]) => transaction) };
    }

    it('«мне вернули 100 000» read as an ordinary income is written with «Нужно проверить»', async () => {
      const { result, sent } = await said('мне вернули 100000', [
        { intent: 'transaction', amount: 100000, category: 'Другое', type: 'income', semanticType: 'income', needsReview: false, date: '2026-07-22' },
      ]);

      expect(sent).toEqual([expect.objectContaining({
        type: 'income',
        semanticType: 'income',
        needsReview: true,
        originalParsing: expect.objectContaining({ needsReview: true }),
      })]);
      expect(result.transactions).toEqual([expect.objectContaining({ id: 'voice-1', needsReview: true })]);
    });

    it('returned money the AI already named a reimbursement is trusted: no «Нужно проверить»', async () => {
      const { sent } = await said('мне вернули 100000', [
        { intent: 'transaction', amount: 100000, category: 'Другое', type: 'income', semanticType: 'reimbursement', date: '2026-07-22' },
      ]);

      expect(sent).toEqual([expect.objectContaining({ semanticType: 'reimbursement', needsReview: false })]);
    });

    it('one amount marked «сум» and a stray number the AI took for the amount: the marked amount, with «Нужно проверить»', async () => {
      const { result, sent } = await said('кофе 1234 сум 1788405366', [
        { intent: 'transaction', amount: 1788405366, category: 'Кафе', type: 'expense', date: '2026-07-22' },
      ]);

      expect(sent).toEqual([expect.objectContaining({
        amount: 1234,
        needsReview: true,
        originalParsing: expect.objectContaining({ amount: 1234, needsReview: true }),
      })]);
      expect(result.transactions).toEqual([expect.objectContaining({ amount: 1234, needsReview: true })]);
    });

    it('two records: each number is its own record, an unmarked one is not a misread', async () => {
      const { sent } = await said('продукты 12000 сум и такси 30000', [
        { intent: 'transaction', amount: 12000, category: 'Продукты', type: 'expense', date: '2026-07-22' },
        { intent: 'transaction', amount: 30000, category: 'Такси', type: 'expense', date: '2026-07-22' },
      ]);

      expect(sent.map(transaction => [transaction.amount, transaction.needsReview])).toEqual([[12000, false], [30000, false]]);
    });

    // What a voice kept of its own (#301, the table in the PR): none of it changes with the shared writer
    it('a record the AI gave no note: what was heard, cut to the 500 characters a note may be', async () => {
      const heard = `кофе 25000 ${'и ещё слово '.repeat(60)}`.trim();
      const { sent } = await said(heard, [{ intent: 'transaction', amount: 25000, category: 'Кафе', type: 'expense', date: '2026-07-22' }]);

      expect(heard.length).toBeGreaterThan(500);
      expect(sent[0].description).toBe(heard.substring(0, 500));
      expect(sent[0].originalText).toBe(heard);
    });

    it('the name of who said it: as given, else the user id', async () => {
      const record = [{ intent: 'transaction', amount: 25000, category: 'Кафе', type: 'expense', date: '2026-07-22' }];

      expect((await said('кофе 25000', record, { userName: ' Shukur ' })).sent[0].userName).toBe('Shukur');
      expect((await said('кофе 25000', record)).sent[0].userName).toBe('user1');
    });
  });
});
