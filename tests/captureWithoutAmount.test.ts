import fs from 'fs/promises';
import { OpenAITranscriptionService } from '../src/modules/voiceProcessing/infrastructure/openAITranscriptionService';
import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { ProcessVoiceInputUseCase } from '../src/modules/voiceProcessing/application/processVoiceInput';
import { NoSpeechDetectedError } from '../src/modules/voiceProcessing/domain/voiceErrors';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { ItemWithoutAmount } from '../src/modules/voiceProcessing/domain/processedTransaction';
import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';
import { QuickCaptureService } from '../src/modules/quickCapture/application/quickCaptureService';
import { isSuspiciouslyLarge, LARGE_AMOUNT_MIN_MINOR } from '../src/modules/voiceProcessing/domain/largeAmount';

/**
 * FT-123: a phrase may name something without an amount («кофе 25к, такси, обед 45»). Nothing is written
 * for «такси»; the capture says it was named, and the bot writes it once the person says how much.
 */

const taxi: ItemWithoutAmount = { description: 'такси', category: 'Транспорт', type: 'expense', date: '2026-10-16' };

function parser(result: Partial<Awaited<ReturnType<TranscriptionService['analyzeInput']>>>): TranscriptionService {
  return {
    analyzeInput: jest.fn().mockResolvedValue({ transactions: [], debts: [], ...result }),
    analyzeTransactions: jest.fn(),
    transcribe: jest.fn(),
  } as unknown as TranscriptionService;
}

function creator(id = 'new-1', resolved: { presetKey?: string } = {}) {
  const execute = jest.fn(async (_transaction: any, options: any) => {
    options?.onResolved?.({
      category: { id: 'cat-1', name: 'Транспорт', presetKey: resolved.presetKey ?? 'transport', type: 'expense', isOther: false },
    });
    return { success: true, data: id };
  });
  return { useCase: { execute } as unknown as CreateTransactionUseCase, execute };
}

describe('the parser reports what was named without an amount (FT-123)', () => {
  const service = new OpenAITranscriptionService('test-api-key') as unknown as {
    parseAnalysisResponse(content: string): { transactions: unknown[]; withoutAmount?: ItemWithoutAmount[] };
  };

  it('keeps an item with no amount aside instead of dropping it', () => {
    const result = service.parseAnalysisResponse(JSON.stringify({
      items: [
        { intent: 'transaction', amount: 25000, category: 'Кафе', type: 'expense', description: 'кофе', date: '2026-10-16' },
        { intent: 'transaction', amount: null, category: 'Транспорт', type: 'expense', description: 'такси', date: '2026-10-16', account: 'cash' },
      ],
    }));

    expect(result.transactions).toHaveLength(1);
    expect(result.withoutAmount).toEqual([
      expect.objectContaining({ description: 'такси', category: 'Транспорт', type: 'expense', date: '2026-10-16', paymentKind: 'cash' }),
    ]);
  });

  it('names it by the merchant when there is no description, and ignores an item that names nothing', () => {
    const result = service.parseAnalysisResponse(JSON.stringify({
      items: [
        { intent: 'transaction', amount: 0, category: 'Покупки', type: 'expense', merchant: 'Uzum' },
        { intent: 'transaction', category: 'Другое', type: 'expense' },
      ],
    }));

    expect(result.transactions).toHaveLength(0);
    expect(result.withoutAmount).toEqual([expect.objectContaining({ description: 'Uzum', category: 'Покупки' })]);
  });

  it('tells the model to return such an item with a null amount', () => {
    const { OPENAI_PROMPTS } = jest.requireActual('../src/shared/domain/constants/messages');
    expect(OPENAI_PROMPTS.RU.USER_ANALYZE_TRANSACTIONS('')).toMatch(/"amount": null/);
  });
});

describe('text and voice capture pass it through (FT-123)', () => {
  it('writes nothing for an item without an amount and returns it', async () => {
    const created = creator();
    const useCase = new ProcessTextInputUseCase(parser({ withoutAmount: [taxi] }), created.useCase);

    const result = await useCase.execute('такси', 'user-1');

    expect(created.execute).not.toHaveBeenCalled();
    expect(result.transactions).toEqual([]);
    expect(result.withoutAmount).toEqual([taxi]);
  });

  describe('an item without an amount is an item of the phrase (FT-123 review)', () => {
    const coffee = { intent: 'transaction' as const, amount: 25000, category: 'Кафе', type: 'expense' as const, description: 'кофе', date: '2026-10-16' };
    const cashTaxi: ItemWithoutAmount = { ...taxi, paymentKind: 'cash' };

    it('«нал» of «такси» does not move the coffee: it goes to the default account', async () => {
      const created = creator('coffee-1', { presetKey: 'cafe' });
      const service = parser({ transactions: [coffee], withoutAmount: [cashTaxi] });
      const useCase = new ProcessTextInputUseCase(service, created.useCase);

      const result = await useCase.execute('кофе 25к, такси нал', 'user-1');

      expect(service.analyzeInput).toHaveBeenCalled();
      expect(created.execute).toHaveBeenCalledTimes(1);
      expect(created.execute.mock.calls[0][1].accountHint).toEqual({ text: undefined, kind: undefined });
      expect(result.withoutAmount).toEqual([cashTaxi]);
    });

    it('«$» and the words of another item are not the coffee’s either', async () => {
      const created = creator('coffee-2', { presetKey: 'transport' });
      const useCase = new ProcessTextInputUseCase(parser({ transactions: [coffee], withoutAmount: [{ ...taxi, description: 'такси в долларах $' }] }), created.useCase);

      const result = await useCase.execute('кофе 25к, такси $', 'user-1');

      expect(created.execute.mock.calls[0][0]).toEqual(expect.objectContaining({ amount: 25000, currency: 'UZS' }));
      // «такси» names Транспорт, but it is the other item's word: for the coffee the category stays a guess
      expect(result.transactions[0].assumptions).toContainEqual(expect.objectContaining({ kind: 'category' }));
    });

    it('a voice message counts it too', async () => {
      jest.spyOn(fs, 'access').mockResolvedValue(undefined);
      jest.spyOn(fs, 'rename').mockResolvedValue(undefined);
      jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);
      const service = parser({ transactions: [coffee], withoutAmount: [cashTaxi] });
      (service.transcribe as jest.Mock).mockResolvedValue('кофе 25 тысяч, такси нал');
      const created = creator('coffee-3', { presetKey: 'cafe' });
      const useCase = new ProcessVoiceInputUseCase(service, created.useCase);

      await useCase.execute({ filePath: '/nowhere/voice.ogg', userId: 'user-1' });

      expect(created.execute).toHaveBeenCalledTimes(1);
      expect(created.execute.mock.calls[0][1].accountHint).toEqual({ text: undefined, kind: undefined });
      jest.restoreAllMocks();
    });
  });

  it('the quick capture result carries it, nothing saved', async () => {
    const created = creator();
    const service = new QuickCaptureService(new ProcessTextInputUseCase(parser({ withoutAmount: [taxi] }), created.useCase));

    const result = await service.capture({ text: 'такси', userId: 'user-1', source: 'telegram' });

    expect(result.status).toBe('no_transaction');
    expect(result.withoutAmount).toEqual([taxi]);
  });

  it('a voice message passes it through too', async () => {
    const access = jest.spyOn(fs, 'access').mockResolvedValue(undefined);
    jest.spyOn(fs, 'rename').mockResolvedValue(undefined);
    jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);
    const service = parser({ withoutAmount: [taxi] });
    (service.transcribe as jest.Mock).mockResolvedValue('такси');
    const useCase = new ProcessVoiceInputUseCase(service, creator().useCase);

    const result = await useCase.execute({ filePath: '/nowhere/voice.ogg', userId: 'user-1' });

    expect(result.withoutAmount).toEqual([taxi]);
    expect(access).toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('a voice message with no speech says so with its own error', async () => {
    jest.spyOn(fs, 'access').mockResolvedValue(undefined);
    jest.spyOn(fs, 'rename').mockResolvedValue(undefined);
    jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);
    const service = parser({});
    (service.transcribe as jest.Mock).mockResolvedValue('   ');
    const useCase = new ProcessVoiceInputUseCase(service, creator().useCase);

    await expect(useCase.execute({ filePath: '/nowhere/voice.ogg', userId: 'user-1' })).rejects.toBeInstanceOf(NoSpeechDetectedError);
    jest.restoreAllMocks();
  });
});

describe('writing a named item once the amount is known (FT-123)', () => {
  it('writes it with the item’s category, note and date, the answer’s amount and account word', async () => {
    const created = creator('taxi-1');
    const useCase = new ProcessTextInputUseCase(parser({}), created.useCase);

    const result = await useCase.executeWithAmount(
      taxi,
      { text: '18к нал', amount: 18000, currency: 'UZS', kind: 'cash' },
      'user-1',
      'Shukur',
      { source: 'telegram' }
    );

    expect(created.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 18000,
        currency: 'UZS',
        category: 'Транспорт',
        description: 'такси',
        type: 'expense',
        date: '2026-10-16',
        source: 'telegram',
        userId: 'user-1',
      }),
      expect.objectContaining({ visibleCategoriesOnly: true, accountHint: expect.objectContaining({ kind: 'cash' }) })
    );
    expect(result).toEqual(expect.objectContaining({ id: 'taxi-1', amount: 18000, category: 'Транспорт' }));
    // «такси» names the category itself: not a guess
    expect(result?.assumptions?.some(assumption => assumption.kind === 'category')).toBe(false);
  });

  it('says «18» was read as 18 000', async () => {
    const useCase = new ProcessTextInputUseCase(parser({}), creator().useCase);

    const result = await useCase.executeWithAmount(taxi, { text: '18', amount: 18000, currency: 'UZS' }, 'user-1');

    expect(result?.assumptions).toContainEqual({ kind: 'thousands', written: '18', amount: 18000 });
  });

  it('the quick capture writes it through the same pipeline', async () => {
    const created = creator('taxi-2');
    const service = new QuickCaptureService(new ProcessTextInputUseCase(parser({}), created.useCase));

    const result = await service.captureWithAmount({
      item: taxi,
      answer: { text: '60$', amount: 60, currency: 'USD' },
      userId: 'user-1',
      source: 'telegram',
    });

    expect(result.status).toBe('saved');
    expect(result.transactions).toEqual([expect.objectContaining({ id: 'taxi-2', currency: 'USD', amount: 60 })]);
  });
});

describe('a suspiciously large amount (FT-123, the prototype rule)', () => {
  const big = { type: 'expense' as const, currency: 'UZS' as const, amountMinor: LARGE_AMOUNT_MIN_MINOR };

  it('is an expense in сум from 10 000 000 in Кафе, Транспорт, Продукты, Связь, Здоровье', () => {
    expect(LARGE_AMOUNT_MIN_MINOR).toBe(10_000_000 * 100);
    for (const presetKey of ['cafe', 'transport', 'groceries', 'telecom', 'health']) {
      expect(isSuspiciouslyLarge({ ...big, presetKey })).toBe(true);
    }
  });

  it('is not below 10 000 000, in other categories, in dollars or for income', () => {
    expect(isSuspiciouslyLarge({ ...big, amountMinor: LARGE_AMOUNT_MIN_MINOR - 100, presetKey: 'cafe' })).toBe(false);
    for (const presetKey of ['shopping', 'home', 'other', null]) {
      expect(isSuspiciouslyLarge({ ...big, presetKey })).toBe(false);
    }
    expect(isSuspiciouslyLarge({ ...big, currency: 'USD', presetKey: 'cafe' })).toBe(false);
    expect(isSuspiciouslyLarge({ ...big, type: 'income', presetKey: 'cafe' })).toBe(false);
  });
});
