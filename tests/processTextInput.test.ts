import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';
import { CreateDebtUseCase } from '../src/modules/debt/application/createDebt';
import { DebtStatus, DebtType } from '../src/modules/debt/domain/debtEntity';

jest.mock('../src/modules/voiceProcessing/infrastructure/openAITranscriptionService');

describe('ProcessTextInputUseCase', () => {
  it('creates simple text transaction locally without calling OpenAI', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-22T09:00:00.000Z'));

    const openAIService = {
      analyzeInput: jest.fn(),
      analyzeTransactions: jest.fn(),
      transcribe: jest.fn()
    } as unknown as TranscriptionService;

    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({ success: true, data: 'fast-1' })
    } as unknown as CreateTransactionUseCase;

    const useCase = new ProcessTextInputUseCase(openAIService, createTransactionUseCase);

    const result = await useCase.execute('кофе 15000 сум', 'user1', 'Shukur');

    expect(openAIService.analyzeInput).not.toHaveBeenCalled();
    expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
      amount: 15000,
      category: 'coffee',
      type: 'expense',
      semanticType: 'expense',
      date: '2026-07-22',
      merchant: 'кофе',
      description: 'кофе',
      userId: 'user1',
      userName: 'Shukur',
      originalText: 'кофе 15000 сум',
      originalParsing: expect.objectContaining({ semanticType: 'expense' }),
    }));
    expect(result.transactions).toEqual([
      expect.objectContaining({
        id: 'fast-1',
        amount: 15000,
        category: 'coffee',
        semanticType: 'expense',
        merchant: 'кофе',
        description: 'кофе',
      })
    ]);

    jest.useRealTimers();
  });

  it('classifies an obvious own-transfer phrase locally without calling OpenAI', async () => {
    const openAIService = {
      analyzeInput: jest.fn(),
      analyzeTransactions: jest.fn(),
      transcribe: jest.fn()
    } as unknown as TranscriptionService;

    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({ success: true, data: 'transfer-fast-1' })
    } as unknown as CreateTransactionUseCase;

    const useCase = new ProcessTextInputUseCase(openAIService, createTransactionUseCase);

    const result = await useCase.execute('перевел 500000 на Alif', 'user1');

    expect(openAIService.analyzeInput).not.toHaveBeenCalled();
    expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
      amount: 500000,
      type: 'expense',
      semanticType: 'own_transfer',
      needsReview: false,
    }));
    expect(result.transactions).toEqual([
      expect.objectContaining({ id: 'transfer-fast-1', semanticType: 'own_transfer', needsReview: false })
    ]);
  });

  it('classifies an obvious savings-deposit phrase locally without calling OpenAI', async () => {
    const openAIService = {
      analyzeInput: jest.fn(),
      analyzeTransactions: jest.fn(),
      transcribe: jest.fn()
    } as unknown as TranscriptionService;

    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({ success: true, data: 'saving-fast-1' })
    } as unknown as CreateTransactionUseCase;

    const useCase = new ProcessTextInputUseCase(openAIService, createTransactionUseCase);

    const result = await useCase.execute('положил 2000000 на вклад', 'user1');

    expect(openAIService.analyzeInput).not.toHaveBeenCalled();
    expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
      amount: 2000000,
      type: 'expense',
      semanticType: 'saving_deposit',
      needsReview: false,
    }));
    expect(result.transactions).toEqual([
      expect.objectContaining({ id: 'saving-fast-1', semanticType: 'saving_deposit', needsReview: false })
    ]);
  });

  it('classifies an obvious cash-withdrawal phrase locally without calling OpenAI', async () => {
    const openAIService = {
      analyzeInput: jest.fn(),
      analyzeTransactions: jest.fn(),
      transcribe: jest.fn()
    } as unknown as TranscriptionService;

    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({ success: true, data: 'cash-fast-1' })
    } as unknown as CreateTransactionUseCase;

    const useCase = new ProcessTextInputUseCase(openAIService, createTransactionUseCase);

    const result = await useCase.execute('снял наличку 1000000', 'user1');

    expect(openAIService.analyzeInput).not.toHaveBeenCalled();
    expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
      amount: 1000000,
      type: 'expense',
      semanticType: 'cash_withdrawal',
      needsReview: false,
    }));
    expect(result.transactions).toEqual([
      expect.objectContaining({ id: 'cash-fast-1', semanticType: 'cash_withdrawal', needsReview: false })
    ]);
  });

  it('classifies an obvious salary/income phrase locally without calling OpenAI', async () => {
    const openAIService = {
      analyzeInput: jest.fn(),
      analyzeTransactions: jest.fn(),
      transcribe: jest.fn()
    } as unknown as TranscriptionService;

    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({ success: true, data: 'income-fast-1' })
    } as unknown as CreateTransactionUseCase;

    const useCase = new ProcessTextInputUseCase(openAIService, createTransactionUseCase);

    const result = await useCase.execute('зарплата 7000000', 'user1');

    expect(openAIService.analyzeInput).not.toHaveBeenCalled();
    expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
      amount: 7000000,
      type: 'income',
      category: 'salary',
      semanticType: 'income',
      needsReview: false,
    }));
    expect(result.transactions).toEqual([
      expect.objectContaining({ id: 'income-fast-1', semanticType: 'income', needsReview: false })
    ]);
  });

  it('falls back to OpenAI for a group-payment phrase instead of guessing a semantic type', async () => {
    const openAIService = {
      analyzeInput: jest.fn().mockResolvedValue({
        transactions: [{
          intent: 'transaction',
          amount: 400000,
          category: 'food',
          type: 'expense',
          semanticType: 'group_payment',
          date: '2026-07-22',
          needsReview: true,
        }],
        debts: []
      }),
      analyzeTransactions: jest.fn(),
      transcribe: jest.fn()
    } as unknown as TranscriptionService;

    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({ success: true, data: 'group-1' })
    } as unknown as CreateTransactionUseCase;

    const useCase = new ProcessTextInputUseCase(openAIService, createTransactionUseCase);

    const result = await useCase.execute('оплатил за всех ужин 400000', 'user1');

    expect(openAIService.analyzeInput).toHaveBeenCalledTimes(1);
    expect(result.transactions).toEqual([
      expect.objectContaining({ id: 'group-1', semanticType: 'group_payment', needsReview: true })
    ]);
  });

  it('falls back to OpenAI for debt-language text instead of using a fast path', async () => {
    const openAIService = {
      analyzeInput: jest.fn().mockResolvedValue({
        transactions: [],
        debts: [{
          debtType: 'i_owe',
          personName: 'друг',
          amount: 50000,
          dueDate: null,
          description: 'занял у друга 50000',
          moneyTransferred: true,
          confidence: 0.9,
        }],
      }),
      analyzeTransactions: jest.fn(),
      transcribe: jest.fn()
    } as unknown as TranscriptionService;

    const createTransactionUseCase = {
      execute: jest.fn(),
    } as unknown as CreateTransactionUseCase;
    const createDebtUseCase = {
      execute: jest.fn().mockResolvedValue({
        success: true,
        data: {
          id: 'debt-fast-1',
          userId: 'user1',
          type: DebtType.I_OWE,
          personName: 'друг',
          originalAmount: 50000,
          remainingAmount: 50000,
          currency: 'UZS',
          status: DebtStatus.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    } as unknown as CreateDebtUseCase;

    const useCase = new ProcessTextInputUseCase(openAIService, createTransactionUseCase, createDebtUseCase);

    const result = await useCase.execute('занял у друга 50000', 'user1');

    expect(openAIService.analyzeInput).toHaveBeenCalledTimes(1);
    expect(result.debts).toEqual([
      expect.objectContaining({ id: 'debt-fast-1', personName: 'друг' })
    ]);
  });


  it('passes through a semanticType returned by OpenAI into the create payload and response', async () => {
    const openAIService = {
      analyzeInput: jest.fn().mockResolvedValue({
        transactions: [{
          intent: 'transaction',
          amount: 200000,
          category: 'other',
          type: 'expense',
          semanticType: 'own_transfer',
          date: '2026-07-22',
          merchant: 'card to card',
        }],
        debts: []
      }),
      analyzeTransactions: jest.fn(),
      transcribe: jest.fn()
    } as unknown as TranscriptionService;

    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({ success: true, data: 'transfer-1' })
    } as unknown as CreateTransactionUseCase;

    const useCase = new ProcessTextInputUseCase(openAIService, createTransactionUseCase);
    const result = await useCase.execute('перевёл себе на карту 200000!', 'user1');

    expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
      semanticType: 'own_transfer',
      originalParsing: expect.objectContaining({ semanticType: 'own_transfer' }),
    }));
    expect(result.transactions).toEqual([
      expect.objectContaining({ id: 'transfer-1', semanticType: 'own_transfer' })
    ]);
  });

  it('normalizes a missing/invalid semanticType from OpenAI based on the legacy type', async () => {
    const openAIService = {
      analyzeInput: jest.fn().mockResolvedValue({
        transactions: [{
          intent: 'transaction',
          amount: 50000,
          category: 'salary',
          type: 'income',
          // semanticType intentionally omitted
          date: '2026-07-22',
        }],
        debts: []
      }),
      analyzeTransactions: jest.fn(),
      transcribe: jest.fn()
    } as unknown as TranscriptionService;

    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({ success: true, data: 'income-1' })
    } as unknown as CreateTransactionUseCase;

    const useCase = new ProcessTextInputUseCase(openAIService, createTransactionUseCase);
    const result = await useCase.execute('получил зарплату 50000!', 'user1');

    expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
      semanticType: 'income',
    }));
    expect(result.transactions).toEqual([
      expect.objectContaining({ id: 'income-1', semanticType: 'income' })
    ]);
  });

  it('passes through needsReview: true returned by OpenAI into the create payload and response', async () => {
    const openAIService = {
      analyzeInput: jest.fn().mockResolvedValue({
        transactions: [{
          intent: 'transaction',
          amount: 40000,
          category: 'other',
          type: 'expense',
          date: '2026-07-22',
          needsReview: true,
        }],
        debts: []
      }),
      analyzeTransactions: jest.fn(),
      transcribe: jest.fn()
    } as unknown as TranscriptionService;

    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({ success: true, data: 'uncertain-1' })
    } as unknown as CreateTransactionUseCase;

    const useCase = new ProcessTextInputUseCase(openAIService, createTransactionUseCase);
    const result = await useCase.execute('непонятная транзакция 40000!', 'user1');

    expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
      needsReview: true,
    }));
    expect(result.transactions).toEqual([
      expect.objectContaining({ id: 'uncertain-1', needsReview: true })
    ]);
  });

  it('defaults needsReview to false when omitted from the OpenAI response', async () => {
    const openAIService = {
      analyzeInput: jest.fn().mockResolvedValue({
        transactions: [{
          intent: 'transaction',
          amount: 40000,
          category: 'other',
          type: 'expense',
          date: '2026-07-22',
        }],
        debts: []
      }),
      analyzeTransactions: jest.fn(),
      transcribe: jest.fn()
    } as unknown as TranscriptionService;

    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({ success: true, data: 'certain-1' })
    } as unknown as CreateTransactionUseCase;

    const useCase = new ProcessTextInputUseCase(openAIService, createTransactionUseCase);
    const result = await useCase.execute('обычная транзакция 40000!', 'user1');

    expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
      needsReview: false,
    }));
    expect(result.transactions).toEqual([
      expect.objectContaining({ id: 'certain-1', needsReview: false })
    ]);
  });

  it('falls back to OpenAI for complex multi-item text instead of using the simple parser', async () => {
    const openAIService = {
      analyzeInput: jest.fn().mockResolvedValue({
        transactions: [
          { intent: 'transaction', amount: 480000, category: 'groceries', type: 'expense', date: '2026-07-22', merchant: 'мясо' },
          { intent: 'transaction', amount: 35000, category: 'groceries', type: 'expense', date: '2026-07-22', merchant: 'яблоки' }
        ],
        debts: []
      }),
      analyzeTransactions: jest.fn(),
      transcribe: jest.fn()
    } as unknown as TranscriptionService;

    const createTransactionUseCase = {
      execute: jest
        .fn()
        .mockResolvedValueOnce({ success: true, data: 'meat-1' })
        .mockResolvedValueOnce({ success: true, data: 'apples-1' })
    } as unknown as CreateTransactionUseCase;

    const useCase = new ProcessTextInputUseCase(openAIService, createTransactionUseCase);

    const result = await useCase.execute('Купил мясо 4кг по 120000 за 1кг. И яблоки за 35000 сум', 'user1');

    expect(openAIService.analyzeInput).toHaveBeenCalledTimes(1);
    expect(createTransactionUseCase.execute).toHaveBeenCalledTimes(2);
    expect(result.transactions).toEqual([
      expect.objectContaining({ id: 'meat-1', amount: 480000, merchant: 'мясо' }),
      expect.objectContaining({ id: 'apples-1', amount: 35000, merchant: 'яблоки' })
    ]);
  });


  it('creates transaction from text analysis', async () => {
    const openAIService = {
      analyzeInput: jest.fn().mockResolvedValue({
        transactions: [{
          intent: 'transaction',
          amount: 5,
          category: 'Food',
          type: 'expense',
          date: '2024-01-01'
        }],
        debts: []
      }),
      analyzeTransactions: jest.fn(),
      transcribe: jest.fn()
    } as unknown as TranscriptionService;

    // Return Result<string> pattern
    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({ success: true, data: '42' })
    } as unknown as CreateTransactionUseCase;

    const useCase = new ProcessTextInputUseCase(openAIService, createTransactionUseCase);
    const result = await useCase.execute('test', 'user1');

    expect(createTransactionUseCase.execute).toHaveBeenCalled();
    expect(result).toEqual({
      text: 'test',
      transactions: [{
        id: '42',
        amount: 5,
        category: 'Food',
        type: 'expense',
        semanticType: 'expense',
        date: '2024-01-01',
        merchant: undefined,
        confidence: undefined,
        description: 'test',
        needsReview: false
      }],
      debts: []
    });
  });

  it('creates multiple transactions when text has more than one entry', async () => {
    const openAIService = {
      analyzeInput: jest.fn().mockResolvedValue({
        transactions: [
          { intent: 'transaction', amount: 5, category: 'Food', type: 'expense', date: '2024-01-01' },
          { intent: 'transaction', amount: 40, category: 'Debt', type: 'expense', date: '2024-01-01' }
        ],
        debts: []
      }),
      analyzeTransactions: jest.fn(),
      transcribe: jest.fn()
    } as unknown as TranscriptionService;

    // Return Result<string> pattern
    const createTransactionUseCase = {
      execute: jest
        .fn()
        .mockResolvedValueOnce({ success: true, data: '1' })
        .mockResolvedValueOnce({ success: true, data: '2' })
    } as unknown as CreateTransactionUseCase;

    const useCase = new ProcessTextInputUseCase(openAIService, createTransactionUseCase);
    const result = await useCase.execute('text', 'user1');

    expect(createTransactionUseCase.execute).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      text: 'text',
      transactions: [
        {
          id: '1',
          amount: 5,
          category: 'Food',
          type: 'expense',
          semanticType: 'expense',
          date: '2024-01-01',
          merchant: undefined,
          confidence: undefined,
          description: 'text',
          needsReview: false
        },
        {
          id: '2',
          amount: 40,
          category: 'Debt',
          type: 'expense',
          semanticType: 'expense',
          date: '2024-01-01',
          merchant: undefined,
          confidence: undefined,
          description: 'text',
          needsReview: false
        }
      ],
      debts: []
    });
  });

  it('handles failed transaction creation gracefully', async () => {
    const openAIService = {
      analyzeInput: jest.fn().mockResolvedValue({
        transactions: [{
          intent: 'transaction',
          amount: 5,
          category: 'Food',
          type: 'expense',
          date: '2024-01-01'
        }],
        debts: []
      }),
      analyzeTransactions: jest.fn(),
      transcribe: jest.fn()
    } as unknown as TranscriptionService;

    // Return failure Result
    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({ success: false, error: new Error('DB error') })
    } as unknown as CreateTransactionUseCase;

    const useCase = new ProcessTextInputUseCase(openAIService, createTransactionUseCase);
    const result = await useCase.execute('test', 'user1');

    expect(createTransactionUseCase.execute).toHaveBeenCalled();
    // Should return empty transactions when creation fails
    expect(result.transactions).toHaveLength(0);
  });

  describe('amount magnitude words', () => {
    function makeDeps(createdId = 'magnitude-1') {
      const openAIService = {
        analyzeInput: jest.fn().mockResolvedValue({ transactions: [], debts: [] }),
        analyzeTransactions: jest.fn(),
        transcribe: jest.fn()
      } as unknown as TranscriptionService;

      const createTransactionUseCase = {
        execute: jest.fn().mockResolvedValue({ success: true, data: createdId })
      } as unknown as CreateTransactionUseCase;

      return {
        openAIService,
        createTransactionUseCase,
        useCase: new ProcessTextInputUseCase(openAIService, createTransactionUseCase),
      };
    }

    it('parses "зарплата 12 млн" as 12 000 000 without leaving "млн" in the text fields', async () => {
      const { openAIService, createTransactionUseCase, useCase } = makeDeps('salary-mln');

      const result = await useCase.execute('зарплата 12 млн', 'user1');

      expect(openAIService.analyzeInput).not.toHaveBeenCalled();
      expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        amount: 12000000,
        type: 'income',
        semanticType: 'income',
        description: 'зарплата',
        merchant: 'зарплата',
      }));
      expect(result.transactions).toEqual([
        expect.objectContaining({ id: 'salary-mln', amount: 12000000, description: 'зарплата' })
      ]);
    });

    it('parses "зарплата 12 миллионов" as 12 000 000', async () => {
      const { createTransactionUseCase, useCase } = makeDeps();

      await useCase.execute('зарплата 12 миллионов', 'user1');

      expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        amount: 12000000,
        type: 'income',
        description: 'зарплата',
        merchant: 'зарплата',
      }));
    });

    it('parses "такси 3.5 млн" as 3 500 000', async () => {
      const { createTransactionUseCase, useCase } = makeDeps();

      await useCase.execute('такси 3.5 млн', 'user1');

      expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        amount: 3500000,
        type: 'expense',
        description: 'такси',
        merchant: 'такси',
      }));
    });

    it('parses "кофе 25 тыс" as 25 000', async () => {
      const { createTransactionUseCase, useCase } = makeDeps();

      await useCase.execute('кофе 25 тыс', 'user1');

      expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        amount: 25000,
        description: 'кофе',
        merchant: 'кофе',
      }));
    });

    it('parses "кофе 25 тысяч" as 25 000', async () => {
      const { createTransactionUseCase, useCase } = makeDeps();

      await useCase.execute('кофе 25 тысяч', 'user1');

      expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        amount: 25000,
        description: 'кофе',
        merchant: 'кофе',
      }));
    });

    it('parses "кофе 15к" as 15 000', async () => {
      const { createTransactionUseCase, useCase } = makeDeps();

      await useCase.execute('кофе 15к', 'user1');

      expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        amount: 15000,
        description: 'кофе',
        merchant: 'кофе',
      }));
    });

    it('parses "кофе 50 тыщ" as 50 000', async () => {
      const { createTransactionUseCase, useCase } = makeDeps();

      await useCase.execute('кофе 50 тыщ', 'user1');

      expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        amount: 50000,
        description: 'кофе',
        merchant: 'кофе',
      }));
    });

    it('parses "такси 2 млн сум" as 2 000 000 and drops both the multiplier and the currency word', async () => {
      const { createTransactionUseCase, useCase } = makeDeps();

      await useCase.execute('такси 2 млн сум', 'user1');

      expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        amount: 2000000,
        description: 'такси',
        merchant: 'такси',
      }));
    });

    it('keeps parsing a plain "1000000" amount without a magnitude word', async () => {
      const { openAIService, createTransactionUseCase, useCase } = makeDeps();

      await useCase.execute('кофе 1000000 сум', 'user1');

      expect(openAIService.analyzeInput).not.toHaveBeenCalled();
      expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        amount: 1000000,
        description: 'кофе',
        merchant: 'кофе',
      }));
    });

    it('never stores a magnitude phrase with a lost order of magnitude when it falls back to OpenAI', async () => {
      const { openAIService, createTransactionUseCase, useCase } = makeDeps();
      (openAIService.analyzeInput as jest.Mock).mockResolvedValue({
        transactions: [{
          intent: 'transaction',
          amount: 12000000,
          category: 'other',
          type: 'expense',
          date: '2026-08-16',
        }],
        debts: []
      });

      await useCase.execute('12 млн', 'user1');

      expect(openAIService.analyzeInput).toHaveBeenCalledTimes(1);
      expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        amount: 12000000,
      }));
    });

    it('sends an ambiguous comma decimal like "зарплата 1,5 млн" to OpenAI instead of guessing the magnitude', async () => {
      const { openAIService, createTransactionUseCase, useCase } = makeDeps();
      (openAIService.analyzeInput as jest.Mock).mockResolvedValue({
        transactions: [{
          intent: 'transaction',
          amount: 1500000,
          category: 'salary',
          type: 'income',
          date: '2026-08-16',
        }],
        debts: []
      });

      await useCase.execute('зарплата 1,5 млн', 'user1');

      expect(openAIService.analyzeInput).toHaveBeenCalledTimes(1);
      expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        amount: 1500000,
      }));
    });

    it('does not read a unit like "кг" as a thousands multiplier', async () => {
      const { openAIService, createTransactionUseCase, useCase } = makeDeps();
      (openAIService.analyzeInput as jest.Mock).mockResolvedValue({
        transactions: [{
          intent: 'transaction',
          amount: 120000,
          category: 'groceries',
          type: 'expense',
          date: '2026-08-16',
        }],
        debts: []
      });

      await useCase.execute('мясо 4кг', 'user1');

      expect(openAIService.analyzeInput).toHaveBeenCalledTimes(1);
      expect(createTransactionUseCase.execute).not.toHaveBeenCalledWith(expect.objectContaining({
        amount: 4000,
      }));
    });

    it('sends income phrases with unrecognized words after the amount to OpenAI instead of storing the bare number', async () => {
      const { openAIService, createTransactionUseCase, useCase } = makeDeps();
      (openAIService.analyzeInput as jest.Mock).mockResolvedValue({
        transactions: [{
          intent: 'transaction',
          amount: 12000000,
          category: 'salary',
          type: 'income',
          date: '2026-08-16',
        }],
        debts: []
      });

      await useCase.execute('зарплата 12 лямов', 'user1');

      expect(openAIService.analyzeInput).toHaveBeenCalledTimes(1);
      expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        amount: 12000000,
      }));
      expect(createTransactionUseCase.execute).not.toHaveBeenCalledWith(expect.objectContaining({
        amount: 12,
      }));
    });
  });

  describe('numbers next to a currency-marked amount', () => {
    function makeDeps(createdId = 'anchored-1') {
      const openAIService = {
        analyzeInput: jest.fn().mockResolvedValue({ transactions: [], debts: [] }),
        analyzeTransactions: jest.fn(),
        transcribe: jest.fn()
      } as unknown as TranscriptionService;

      const createTransactionUseCase = {
        execute: jest.fn().mockResolvedValue({ success: true, data: createdId })
      } as unknown as CreateTransactionUseCase;

      return {
        openAIService,
        createTransactionUseCase,
        useCase: new ProcessTextInputUseCase(openAIService, createTransactionUseCase),
      };
    }

    it('does not store a trailing unmarked number as the amount when the text marks one with a currency word', async () => {
      const { openAIService, createTransactionUseCase, useCase } = makeDeps('anchored-coffee');
      (openAIService.analyzeInput as jest.Mock).mockResolvedValue({
        transactions: [{
          intent: 'transaction',
          amount: 1788405366,
          category: 'coffee',
          type: 'expense',
          date: '2026-09-03',
          merchant: 'hermes',
          description: 'кофе 1234 сум',
        }],
        debts: []
      });

      await useCase.execute('тест hermes кофе 1234 сум 1788405366', 'user1');

      expect(createTransactionUseCase.execute).not.toHaveBeenCalledWith(expect.objectContaining({
        amount: 1788405366,
      }));
      expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        amount: 1234,
        needsReview: true,
      }));
    });

    it('keeps the amount OpenAI chose when it is the currency-marked one', async () => {
      const { openAIService, createTransactionUseCase, useCase } = makeDeps('anchored-ok');
      (openAIService.analyzeInput as jest.Mock).mockResolvedValue({
        transactions: [{
          intent: 'transaction',
          amount: 1234,
          category: 'coffee',
          type: 'expense',
          date: '2026-09-03',
          merchant: 'hermes',
        }],
        debts: []
      });

      await useCase.execute('тест hermes кофе 1234 сум 1788405366', 'user1');

      expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        amount: 1234,
        needsReview: false,
      }));
    });

    it('leaves a computed total alone when it is not one of the numbers written in the text', async () => {
      const { openAIService, createTransactionUseCase, useCase } = makeDeps('anchored-total');
      (openAIService.analyzeInput as jest.Mock).mockResolvedValue({
        transactions: [{
          intent: 'transaction',
          amount: 100000,
          category: 'other',
          type: 'expense',
          date: '2026-09-03',
        }],
        debts: []
      });

      await useCase.execute('2 билета по 50000 сум', 'user1');

      expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        amount: 100000,
        needsReview: false,
      }));
    });

    it('leaves multi-item text alone where each number belongs to its own transaction', async () => {
      const { openAIService, createTransactionUseCase, useCase } = makeDeps('anchored-multi');
      (openAIService.analyzeInput as jest.Mock).mockResolvedValue({
        transactions: [
          {
            intent: 'transaction',
            amount: 12000,
            category: 'groceries',
            type: 'expense',
            date: '2026-09-03',
          },
          {
            intent: 'transaction',
            amount: 30000,
            category: 'taxi',
            type: 'expense',
            date: '2026-09-03',
          },
        ],
        debts: []
      });

      await useCase.execute('продукты 12000 сум и такси 30000', 'user1');

      expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        amount: 30000,
        needsReview: false,
      }));
    });

    it('flags the capture for review without guessing when the text marks several different amounts', async () => {
      const { openAIService, createTransactionUseCase, useCase } = makeDeps('anchored-many');
      (openAIService.analyzeInput as jest.Mock).mockResolvedValue({
        transactions: [{
          intent: 'transaction',
          amount: 777,
          category: 'other',
          type: 'expense',
          date: '2026-09-03',
        }],
        debts: []
      });

      await useCase.execute('кофе 1234 сум обед 5000 сум 777', 'user1');

      expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        needsReview: true,
      }));
    });
  });

  describe('cash withdrawal wording', () => {
    function makeDeps(createdId = 'cash-1') {
      const openAIService = {
        analyzeInput: jest.fn().mockResolvedValue({ transactions: [], debts: [] }),
        analyzeTransactions: jest.fn(),
        transcribe: jest.fn()
      } as unknown as TranscriptionService;

      const createTransactionUseCase = {
        execute: jest.fn().mockResolvedValue({ success: true, data: createdId })
      } as unknown as CreateTransactionUseCase;

      return {
        openAIService,
        createTransactionUseCase,
        useCase: new ProcessTextInputUseCase(openAIService, createTransactionUseCase),
      };
    }

    const withdrawalPhrases: Array<[string, number]> = [
      ['снял в банкомате 300000', 300000],
      ['снял 300000 в банкомате', 300000],
      ['снял с карты 300000', 300000],
      ['снял со счета 500000', 500000],
      ['обналичил 300000', 300000],
      ['снял наличные 200000', 200000],
      // Uzbek formulations already present in the parser keywords
      ['bankomatdan 300000 yechdim', 300000],
      ['kartadan 500000 yechib oldim', 500000],
      ['nakd 200000 yechdim', 200000],
      ['naqd 200000 yechdim', 200000],
    ];

    it.each(withdrawalPhrases)('classifies "%s" as cash_withdrawal without calling OpenAI', async (phrase, amount) => {
      const { openAIService, createTransactionUseCase, useCase } = makeDeps('cash-fast');

      const result = await useCase.execute(phrase, 'user1');

      expect(openAIService.analyzeInput).not.toHaveBeenCalled();
      expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        amount,
        category: 'transfer',
        semanticType: 'cash_withdrawal',
        needsReview: false,
      }));
      expect(result.transactions).toEqual([
        expect.objectContaining({ id: 'cash-fast', amount, semanticType: 'cash_withdrawal' })
      ]);
    });

    const ambiguousPhrases = [
      'снял 300000',
      'снял квартиру 3000000',
      'снял с карты 12 лямов',
    ];

    it.each(ambiguousPhrases)('sends the ambiguous phrase "%s" to OpenAI instead of storing an expense', async (phrase) => {
      const { openAIService, createTransactionUseCase, useCase } = makeDeps();
      (openAIService.analyzeInput as jest.Mock).mockResolvedValue({
        transactions: [{
          intent: 'transaction',
          amount: 300000,
          category: 'other',
          type: 'expense',
          semanticType: 'cash_withdrawal',
          date: '2026-08-16',
        }],
        debts: []
      });

      await useCase.execute(phrase, 'user1');

      expect(openAIService.analyzeInput).toHaveBeenCalledTimes(1);
      expect(createTransactionUseCase.execute).not.toHaveBeenCalledWith(expect.objectContaining({
        semanticType: 'expense',
      }));
    });

    it('does not treat an own-transfer phrase as a cash withdrawal', async () => {
      const { createTransactionUseCase, useCase } = makeDeps();

      await useCase.execute('перевел 500000 на карту', 'user1');

      expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        semanticType: 'own_transfer',
      }));
    });
  });

  it('does not report the debt id as linkedTransactionId when the debt result has no transaction id', async () => {
    const openAIService = {
      analyzeInput: jest.fn().mockResolvedValue({
        transactions: [],
        debts: [{
          debtType: 'owed_to_me',
          personName: 'Bob',
          amount: 100,
          dueDate: null,
          description: 'lent Bob 100',
          moneyTransferred: true,
          confidence: 0.9,
        }],
      }),
      analyzeTransactions: jest.fn(),
      transcribe: jest.fn(),
    } as unknown as TranscriptionService;

    const createTransactionUseCase = {
      execute: jest.fn(),
    } as unknown as CreateTransactionUseCase;
    const createDebtUseCase = {
      execute: jest.fn().mockResolvedValue({
        success: true,
        data: {
          id: 'debt-1',
          userId: 'user1',
          type: DebtType.OWED_TO_ME,
          personName: 'Bob',
          originalAmount: 100,
          remainingAmount: 100,
          currency: 'UZS',
          status: DebtStatus.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    } as unknown as CreateDebtUseCase;

    const useCase = new ProcessTextInputUseCase(openAIService, createTransactionUseCase, createDebtUseCase);

    const result = await useCase.execute('lent Bob 100', 'user1');

    expect(result.debts).toEqual([
      expect.objectContaining({
        id: 'debt-1',
        linkedTransactionId: undefined,
      }),
    ]);
  });

  describe('repayment wording', () => {
    function makeDeps(createdId = 'repayment-1') {
      const openAIService = {
        analyzeInput: jest.fn().mockResolvedValue({ transactions: [], debts: [] }),
        analyzeTransactions: jest.fn(),
        transcribe: jest.fn()
      } as unknown as TranscriptionService;

      const createTransactionUseCase = {
        execute: jest.fn().mockResolvedValue({ success: true, data: createdId })
      } as unknown as CreateTransactionUseCase;

      return {
        openAIService,
        createTransactionUseCase,
        useCase: new ProcessTextInputUseCase(openAIService, createTransactionUseCase),
      };
    }

    const repaymentPhrases = [
      'мне вернули 100000',
      'я вернул 50000',
      'вернул Азизу 50000',
      'возврат 70000',
      'qarzni qaytardim 50000',
    ];

    it.each(repaymentPhrases)('does not store "%s" as a plain expense through a fast path', async (phrase) => {
      const { openAIService, createTransactionUseCase, useCase } = makeDeps();

      await useCase.execute(phrase, 'user1');

      expect(openAIService.analyzeInput).toHaveBeenCalledTimes(1);
      expect(createTransactionUseCase.execute).not.toHaveBeenCalled();
    });

    it('flags a returned-money capture that OpenAI read as an ordinary expense', async () => {
      const { openAIService, createTransactionUseCase, useCase } = makeDeps('repay-1');
      (openAIService.analyzeInput as jest.Mock).mockResolvedValue({
        transactions: [{
          intent: 'transaction',
          amount: 50000,
          category: 'other',
          type: 'expense',
          semanticType: 'expense',
          needsReview: false,
          date: '2026-09-03',
        }],
        debts: []
      });

      const result = await useCase.execute('я вернул 50000', 'user1');

      expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        semanticType: 'expense',
        needsReview: true,
        originalParsing: expect.objectContaining({ needsReview: true }),
      }));
      expect(result.transactions).toEqual([
        expect.objectContaining({ id: 'repay-1', needsReview: true })
      ]);
    });

    it('flags returned money that OpenAI read as ordinary income', async () => {
      const { openAIService, createTransactionUseCase, useCase } = makeDeps('repay-2');
      (openAIService.analyzeInput as jest.Mock).mockResolvedValue({
        transactions: [{
          intent: 'transaction',
          amount: 100000,
          category: 'other-income',
          type: 'income',
          semanticType: 'income',
          needsReview: false,
          date: '2026-09-03',
        }],
        debts: []
      });

      const result = await useCase.execute('мне вернули 100000', 'user1');

      expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        needsReview: true,
      }));
      expect(result.transactions).toEqual([
        expect.objectContaining({ id: 'repay-2', needsReview: true })
      ]);
    });

    it('leaves a repayment that OpenAI already labelled as reimbursement untouched', async () => {
      const { openAIService, createTransactionUseCase, useCase } = makeDeps('repay-3');
      (openAIService.analyzeInput as jest.Mock).mockResolvedValue({
        transactions: [{
          intent: 'transaction',
          amount: 100000,
          category: 'other-income',
          type: 'income',
          semanticType: 'reimbursement',
          needsReview: false,
          date: '2026-09-03',
        }],
        debts: []
      });

      await useCase.execute('мне вернули 100000', 'user1');

      expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        semanticType: 'reimbursement',
        needsReview: false,
      }));
    });

    // "вернулся" is not a repayment: the guard must bound the verb, not match its stem.
    // Its category stays 'other' because the whole label is categorized, which is existing behavior.
    const unrelatedPhrases: Array<[string, string, number]> = [
      ['вернулся домой такси 30000', 'other', 30000],
      ['продукты 50000', 'groceries', 50000],
    ];

    it.each(unrelatedPhrases)('still parses "%s" locally as an ordinary expense', async (phrase, category, amount) => {
      const { openAIService, createTransactionUseCase, useCase } = makeDeps('plain-1');

      await useCase.execute(phrase, 'user1');

      expect(openAIService.analyzeInput).not.toHaveBeenCalled();
      expect(createTransactionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        amount,
        category,
        semanticType: 'expense',
        needsReview: false,
      }));
    });
  });

  describe('debt direction wording', () => {
    function makeDeps(parsedDebtType: 'i_owe' | 'owed_to_me', personName: string) {
      const openAIService = {
        analyzeInput: jest.fn().mockResolvedValue({
          transactions: [],
          debts: [{
            intent: 'debt',
            debtType: parsedDebtType,
            personName,
            amount: 300000,
            dueDate: null,
            moneyTransferred: true,
            confidence: 0.9,
          }],
        }),
        analyzeTransactions: jest.fn(),
        transcribe: jest.fn()
      } as unknown as TranscriptionService;

      const createTransactionUseCase = {
        execute: jest.fn(),
      } as unknown as CreateTransactionUseCase;

      const createDebtUseCase = {
        execute: jest.fn().mockResolvedValue({
          success: true,
          data: {
            id: 'debt-direction-1',
            userId: 'user1',
            type: DebtType.OWED_TO_ME,
            personName,
            originalAmount: 300000,
            remainingAmount: 300000,
            currency: 'UZS',
            status: DebtStatus.ACTIVE,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        }),
      } as unknown as CreateDebtUseCase;

      return {
        createDebtUseCase,
        useCase: new ProcessTextInputUseCase(openAIService, createTransactionUseCase, createDebtUseCase),
      };
    }

    const lendingPhrases = [
      'одолжил Азизу 300000',
      'одолжила Азизу 300000',
      'дал в долг Азизу 300000',
    ];

    it.each(lendingPhrases)('records "%s" as owed_to_me even when the parse says i_owe', async (phrase) => {
      const { createDebtUseCase, useCase } = makeDeps('i_owe', 'Азиз');

      const result = await useCase.execute(phrase, 'user1');

      expect(createDebtUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        type: DebtType.OWED_TO_ME,
        personName: 'Азиз',
        amount: 300000,
      }));
      expect(result.debts).toEqual([
        expect.objectContaining({ debtType: 'owed_to_me' })
      ]);
    });

    const borrowingPhrases = [
      'занял 200000 у Алишера',
      'одолжил у Азиза 300000',
      'мне одолжил Азиз 300000',
      'взял в долг у Азиза 300000',
    ];

    it.each(borrowingPhrases)('keeps "%s" as the parsed i_owe direction', async (phrase) => {
      const { createDebtUseCase, useCase } = makeDeps('i_owe', 'Азиз');

      const result = await useCase.execute(phrase, 'user1');

      expect(createDebtUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        type: DebtType.I_OWE,
      }));
      expect(result.debts).toEqual([
        expect.objectContaining({ debtType: 'i_owe' })
      ]);
    });

    it('leaves a debt phrase without a lending verb to the parser', async () => {
      const { createDebtUseCase, useCase } = makeDeps('i_owe', 'Азиз');

      await useCase.execute('долг Азизу 300000', 'user1');

      expect(createDebtUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        type: DebtType.I_OWE,
      }));
    });
  });
});
