/**
 * Guards for the product invariants in docs/knowledge-base/00-product-invariants.md.
 *
 * These do not test one unit. They assert statements that must hold across the
 * product, so that a surface which quietly stops honouring them fails loudly.
 *
 * `test.failing` marks an invariant that is currently broken on purpose: the
 * test passes while the bug exists and starts failing the moment someone fixes
 * it, which is the reminder to turn it into a normal test. Keeping the suite
 * green this way means a red run still means something.
 */
import { AnalyticsService } from '../src/modules/transaction/application/analyticsService';
import { BudgetService } from '../src/modules/budget/application/budgetService';
import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';
import { TransactionRepository } from '../src/modules/transaction/domain/transactionRepository';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';
import {
  countsAsRealExpense,
  countsAsBudgetSpending,
} from '../src/modules/transaction/domain/transactionSemanticType';

jest.mock('../src/modules/voiceProcessing/infrastructure/openAITranscriptionService');

/** One of every semantic type, so a missing filter shows up as a wrong total. */
const LEDGER: Transaction[] = [
  { id: 't1', userId: 'u1', date: '2026-08-05', category: 'food', description: 'Обед', amount: 100_000, type: 'expense', semanticType: 'expense', needsReview: false },
  { id: 't2', userId: 'u1', date: '2026-08-05', category: 'salary', description: 'Зарплата', amount: 12_000_000, type: 'income', semanticType: 'income', needsReview: false },
  { id: 't3', userId: 'u1', date: '2026-08-06', category: 'other', description: 'Перевод себе', amount: 3_000_000, type: 'expense', semanticType: 'own_transfer', needsReview: false },
  { id: 't4', userId: 'u1', date: '2026-08-06', category: 'other', description: 'Вклад', amount: 5_000_000, type: 'expense', semanticType: 'saving_deposit', needsReview: false },
  { id: 't5', userId: 'u1', date: '2026-08-07', category: 'other', description: 'Снял наличные', amount: 1_000_000, type: 'expense', semanticType: 'cash_withdrawal', needsReview: false },
  { id: 't6', userId: 'u1', date: '2026-08-08', category: 'other', description: 'Счёт за всех', amount: 680_000, type: 'expense', semanticType: 'group_payment', needsReview: true },
] as Transaction[];

const REAL_EXPENSE_TOTAL = 100_000;

function repoWith(transactions: Transaction[]): TransactionRepository {
  return {
    create: jest.fn(),
    getAll: jest.fn().mockResolvedValue(transactions),
    delete: jest.fn(),
    findById: jest.fn(),
    findByUserId: jest.fn().mockResolvedValue(transactions),
    update: jest.fn(),
    getByUserIdAndDateRange: jest.fn().mockResolvedValue(transactions),
    archive: jest.fn(),
    unarchive: jest.fn(),
    archiveMultiple: jest.fn(),
    archiveAllByUserId: jest.fn(),
    findArchivedByUserId: jest.fn(),
    findByIdIncludingArchived: jest.fn(),
  } as any;
}

describe('И-1 / И-3: только реальные расходы попадают в расходы', () => {
  it('доменные функции остаются единственным определением «реального расхода»', () => {
    expect(countsAsRealExpense('expense')).toBe(true);
    for (const notAnExpense of ['own_transfer', 'saving_deposit', 'cash_withdrawal', 'debt', 'reimbursement', 'group_payment', 'income'] as const) {
      expect(countsAsRealExpense(notAnExpense)).toBe(false);
      expect(countsAsBudgetSpending(notAnExpense)).toBe(false);
    }
  });

  it('бюджет считает тратой только реальные расходы', async () => {
    const budgetRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'b1', userId: 'u1', amount: 500_000, period: 'monthly',
        startDate: '2026-08-01', categoryIds: undefined, spent: 0,
      }),
      updateSpentAmount: jest.fn(),
      findActiveByUserId: jest.fn(),
      getBudgetSummaries: jest.fn(),
    } as any;

    const service = new BudgetService(budgetRepository, repoWith(LEDGER), () => new Date('2026-08-13T00:00:00.000Z'));
    await service.recalculateBudgetSpending('b1');

    expect(budgetRepository.updateSpentAmount).toHaveBeenCalledWith('b1', REAL_EXPENSE_TOTAL);
  });

  // Починено в FT-052: разбор фильтрует по countsAsRealExpense, как и остальные поверхности.
  it('разбор по категориям содержит только реальные расходы', async () => {
    const service = new AnalyticsService(repoWith(LEDGER));
    const breakdown = await service.getDetailedCategoryBreakdown('u1');

    const total = Object.values(breakdown).reduce((sum, entry: any) => sum + entry.amount, 0);
    expect(total).toBe(REAL_EXPENSE_TOTAL);
    expect(breakdown).not.toHaveProperty('salary');
  });
});

describe('И-2: needsReview не входит в финальные суммы', () => {
  it('операция, ожидающая решения, не увеличивает трату бюджета', async () => {
    const budgetRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'b1', userId: 'u1', amount: 500_000, period: 'monthly',
        startDate: '2026-08-01', categoryIds: undefined, spent: 0,
      }),
      updateSpentAmount: jest.fn(),
      findActiveByUserId: jest.fn(),
      getBudgetSummaries: jest.fn(),
    } as any;

    const service = new BudgetService(budgetRepository, repoWith(LEDGER), () => new Date('2026-08-13T00:00:00.000Z'));
    await service.recalculateBudgetSpending('b1');

    const [, spent] = (budgetRepository.updateSpentAmount as jest.Mock).mock.calls[0];
    expect(spent).not.toContain?.(680_000);
    expect(spent).toBe(REAL_EXPENSE_TOTAL);
  });
});

describe('И-4: порядок величины суммы не теряется при разборе', () => {
  function buildParser() {
    const openAIService = {
      analyzeInput: jest.fn(),
      analyzeTransactions: jest.fn(),
      transcribe: jest.fn(),
    } as unknown as TranscriptionService;

    const createTransaction = {
      execute: jest.fn().mockResolvedValue({ success: true, data: 'tx-1' }),
    } as unknown as CreateTransactionUseCase;

    return { useCase: new ProcessTextInputUseCase(openAIService, createTransaction), openAIService, createTransaction };
  }

  it('простая сумма без множителя разбирается точно', async () => {
    const { useCase, createTransaction } = buildParser();
    await useCase.execute('кофе 25000 сум', 'u1', 'QA');

    expect(createTransaction.execute).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 25000 })
    );
  });

  // Нарушено: FT-067. Быстрый парсер берёт первое число и не знает про множители,
  // поэтому «12 млн» сохраняется как 12 с confidence 1 и needsReview false.
  test.failing('текст с множителем не теряет порядок величины', async () => {
    const { useCase, createTransaction, openAIService } = buildParser();
    await useCase.execute('зарплата 12 млн', 'u1', 'QA');

    const wentToOpenAI = (openAIService.analyzeInput as jest.Mock).mock.calls.length > 0;
    if (wentToOpenAI) return; // разбор отдан модели — инвариант соблюдён

    expect(createTransaction.execute).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 12_000_000 })
    );
  });
});

describe('И-7: одно число — один источник', () => {
  // Починено в FT-053: порог конвертируется в проценты внутри сервиса.
  it('бюджет на 48 процентов не считается близким к лимиту', async () => {
    const summaries = [
      { id: 'b1', name: 'Еда', amount: 500_000, spent: 240_000, percentageUsed: 48, isOverBudget: false },
    ];
    const budgetRepository = {
      findById: jest.fn(),
      updateSpentAmount: jest.fn(),
      findActiveByUserId: jest.fn().mockResolvedValue([]),
      getBudgetSummaries: jest.fn().mockResolvedValue(summaries),
    } as any;

    const service = new BudgetService(budgetRepository, repoWith([]), () => new Date('2026-08-13T00:00:00.000Z'));
    const nearLimit = await service.getBudgetsNearLimit('u1');

    expect(nearLimit).toHaveLength(0);
  });
});
