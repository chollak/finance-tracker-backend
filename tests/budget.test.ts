import { CreateBudgetUseCase } from '../src/modules/budget/application/createBudget';
import { GetBudgetsUseCase } from '../src/modules/budget/application/getBudgets';
import { UpdateBudgetUseCase } from '../src/modules/budget/application/updateBudget';
import { DeleteBudgetUseCase } from '../src/modules/budget/application/deleteBudget';
import { BudgetService } from '../src/modules/budget/application/budgetService';
import { SqliteBudgetRepository } from '../src/modules/budget/infrastructure/sqliteBudgetRepository';
import { SqliteTransactionRepository } from '../src/modules/transaction/infrastructure/persistence/SqliteTransactionRepository';
import { BudgetPeriod } from '../src/modules/budget/domain/budgetEntity';
import { CreateBudgetData, UpdateBudgetData } from '../src/modules/budget/domain/budgetEntity';
import { initializeDatabase, closeDatabase } from '../src/shared/infrastructure/database/database.config';
import { ResultHelper } from '../src/shared/domain/types/Result';

// Mock TypeORM
jest.mock('typeorm', () => ({
  DataSource: jest.fn(),
  Entity: () => () => {},
  PrimaryGeneratedColumn: () => () => {},
  Column: () => () => {},
  CreateDateColumn: () => () => {},
  UpdateDateColumn: () => () => {},
  ManyToOne: () => () => {},
  OneToMany: () => () => {},
  JoinColumn: () => () => {},
}));

// Mock database config
jest.mock('../src/shared/infrastructure/database/database.config', () => ({
  initializeDatabase: jest.fn(),
  closeDatabase: jest.fn(),
  AppDataSource: {
    getRepository: jest.fn(),
  },
}));

describe('Budget System', () => {
  let budgetRepository: SqliteBudgetRepository;
  let transactionRepository: SqliteTransactionRepository;
  let createBudgetUseCase: CreateBudgetUseCase;
  let getBudgetsUseCase: GetBudgetsUseCase;
  let updateBudgetUseCase: UpdateBudgetUseCase;
  let deleteBudgetUseCase: DeleteBudgetUseCase;
  let budgetService: BudgetService;

  const mockBudgetEntity = {
    id: 'budget-123',
    name: 'Food Budget',
    amount: 500,
    period: BudgetPeriod.MONTHLY,
    startDate: '2024-01-01',
    endDate: '2024-01-31',
    categoryIds: ['food'],
    isActive: true,
    spent: 150,
    description: 'Monthly food expenses',
    userId: 'user-123',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockBudgetSummary = {
    id: 'budget-123',
    name: 'Food Budget',
    amount: 500,
    spent: 150,
    remaining: 350,
    percentageUsed: 30,
    isOverBudget: false,
    period: BudgetPeriod.MONTHLY,
    daysRemaining: 15
  };

  beforeEach(() => {
    // Create mock repository with all necessary methods
    budgetRepository = {
      create: jest.fn(),
      getById: jest.fn(),
      getByUserId: jest.fn(),
      getActiveBudgetsByUserId: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      getBudgetSummary: jest.fn(),
      getBudgetSummaries: jest.fn(),
      updateSpentAmount: jest.fn(),
    } as any;

    transactionRepository = {
      getByUserIdAndDateRange: jest.fn(),
    } as any;

    createBudgetUseCase = new CreateBudgetUseCase(budgetRepository);
    getBudgetsUseCase = new GetBudgetsUseCase(budgetRepository);
    updateBudgetUseCase = new UpdateBudgetUseCase(budgetRepository);
    deleteBudgetUseCase = new DeleteBudgetUseCase(budgetRepository);
    budgetService = new BudgetService(budgetRepository, transactionRepository);
  });

  describe('CreateBudgetUseCase', () => {
    it('should create a budget successfully', async () => {
      const budgetData: CreateBudgetData = {
        name: 'Food Budget',
        amount: 500,
        period: BudgetPeriod.MONTHLY,
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        categoryIds: ['food'],
        description: 'Monthly food expenses',
        userId: 'user-123'
      };

      (budgetRepository.create as jest.Mock).mockResolvedValue(mockBudgetEntity);

      const result = await createBudgetUseCase.execute(budgetData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Food Budget');
        expect(result.data.amount).toBe(500);
        expect(result.data.userId).toBe('user-123');
      }
    });

    it('should fail when budget name is empty', async () => {
      const budgetData: CreateBudgetData = {
        name: '',
        amount: 500,
        period: BudgetPeriod.MONTHLY,
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        userId: 'user-123'
      };

      const result = await createBudgetUseCase.execute(budgetData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Budget name is required');
      }
    });

    it('should fail when amount is zero or negative', async () => {
      const budgetData: CreateBudgetData = {
        name: 'Test Budget',
        amount: 0,
        period: BudgetPeriod.MONTHLY,
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        userId: 'user-123'
      };

      const result = await createBudgetUseCase.execute(budgetData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Budget amount must be greater than 0');
      }
    });
  });

  describe('GetBudgetsUseCase', () => {
    it('should get all budgets for a user', async () => {
      (budgetRepository.getByUserId as jest.Mock).mockResolvedValue([mockBudgetEntity]);

      const result = await getBudgetsUseCase.executeGetAll('user-123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].name).toBe('Food Budget');
      }
    });

    it('should get active budgets for a user', async () => {
      (budgetRepository.getActiveBudgetsByUserId as jest.Mock).mockResolvedValue([mockBudgetEntity]);

      const result = await getBudgetsUseCase.executeGetActive('user-123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].isActive).toBe(true);
      }
    });

    it('should get budget summaries', async () => {
      (budgetRepository.getBudgetSummaries as jest.Mock).mockResolvedValue([mockBudgetSummary]);

      const result = await getBudgetsUseCase.executeGetSummaries('user-123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].percentageUsed).toBe(30);
        expect(result.data[0].remaining).toBe(350);
      }
    });
  });

  describe('UpdateBudgetUseCase', () => {
    it('should update budget successfully', async () => {
      const updateData: UpdateBudgetData = {
        name: 'Updated Food Budget',
        amount: 600
      };

      (budgetRepository.getById as jest.Mock).mockResolvedValue(mockBudgetEntity);
      (budgetRepository.update as jest.Mock).mockResolvedValue({
        ...mockBudgetEntity,
        ...updateData
      });

      const result = await updateBudgetUseCase.execute('budget-123', updateData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Updated Food Budget');
        expect(result.data.amount).toBe(600);
      }
    });

    it('should fail when budget is not found', async () => {
      (budgetRepository.getById as jest.Mock).mockResolvedValue(null);

      const result = await updateBudgetUseCase.execute('budget-123', { name: 'Updated' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Budget not found');
      }
    });
  });

  describe('DeleteBudgetUseCase', () => {
    it('should delete budget successfully', async () => {
      (budgetRepository.getById as jest.Mock).mockResolvedValue(mockBudgetEntity);
      (budgetRepository.delete as jest.Mock).mockResolvedValue(undefined);

      const result = await deleteBudgetUseCase.execute('budget-123');

      expect(result.success).toBe(true);
      expect(budgetRepository.delete).toHaveBeenCalledWith('budget-123');
    });

    it('should fail when budget is not found', async () => {
      (budgetRepository.getById as jest.Mock).mockResolvedValue(null);

      const result = await deleteBudgetUseCase.execute('budget-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Budget not found');
      }
    });
  });

  describe('BudgetService', () => {
    it('should get budget summaries', async () => {
      (budgetRepository.getBudgetSummaries as jest.Mock).mockResolvedValue([mockBudgetSummary]);

      const summaries = await budgetService.getBudgetSummaries('user-123');

      expect(summaries).toHaveLength(1);
      expect(summaries[0].percentageUsed).toBe(30);
    });

    it('should get budgets near limit', async () => {
      const nearLimitBudget = { ...mockBudgetSummary, percentageUsed: 85 };
      (budgetRepository.getBudgetSummaries as jest.Mock).mockResolvedValue([nearLimitBudget]);

      const nearLimit = await budgetService.getBudgetsNearLimit('user-123', 0.8);

      expect(nearLimit).toHaveLength(1);
      expect(nearLimit[0].percentageUsed).toBe(85);
    });

    it('should get over budget budgets', async () => {
      const overBudget = { ...mockBudgetSummary, isOverBudget: true, percentageUsed: 120 };
      (budgetRepository.getBudgetSummaries as jest.Mock).mockResolvedValue([overBudget]);

      const overBudgets = await budgetService.getOverBudgets('user-123');

      expect(overBudgets).toHaveLength(1);
      expect(overBudgets[0].isOverBudget).toBe(true);
    });

    it('should generate budget period dates', () => {
      const startDate = new Date('2024-01-01');
      const monthlyDates = budgetService.generateBudgetPeriodDates(BudgetPeriod.MONTHLY, startDate);
      
      expect(monthlyDates.startDate).toBe('2024-01-01');
      expect(monthlyDates.endDate).toBe('2024-02-01');

      const weeklyDates = budgetService.generateBudgetPeriodDates(BudgetPeriod.WEEKLY, startDate);
      expect(weeklyDates.startDate).toBe('2024-01-01');
      expect(weeklyDates.endDate).toBe('2024-01-08');
    });
  });
});