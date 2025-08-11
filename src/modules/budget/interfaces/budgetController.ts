import { Request, Response } from 'express';
import { BudgetModule } from '../budgetModule';
import { CreateBudgetData, UpdateBudgetData } from '../domain/budgetEntity';
import { BudgetPeriod } from '../../../database/entities/Budget';
import { handleControllerError, handleControllerSuccess } from '../../../shared/utils/controllerHelpers';
import { ResultHelper } from '../../../shared/types/Result';

export class BudgetController {
  private budgetModule: BudgetModule;

  constructor(budgetModule: BudgetModule) {
    this.budgetModule = budgetModule;
  }

  createBudget = async (req: Request, res: Response) => {
    try {
      const { name, amount, period, startDate, endDate, categoryIds, description } = req.body;
      const { userId } = req.params;

      if (!userId) {
        return handleControllerError(new Error('User ID is required'), res);
      }

      const budgetData: CreateBudgetData = {
        name,
        amount: parseFloat(amount),
        period: period as BudgetPeriod,
        startDate,
        endDate,
        categoryIds,
        description,
        userId
      };

      const result = await this.budgetModule.createBudgetUseCase.execute(budgetData);

      if (!result.success) {
        return handleControllerError(result.error, res);
      }

      return handleControllerSuccess(result.data, res, 201, 'Budget created successfully');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };

  getBudgets = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { active } = req.query;

      if (!userId) {
        return handleControllerError(new Error('User ID is required'), res);
      }

      const result = active === 'true' 
        ? await this.budgetModule.getBudgetsUseCase.executeGetActive(userId)
        : await this.budgetModule.getBudgetsUseCase.executeGetAll(userId);

      if (!result.success) {
        return handleControllerError(result.error, res);
      }

      return handleControllerSuccess(result.data, res, 200, 'Budgets retrieved successfully');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };

  getBudget = async (req: Request, res: Response) => {
    try {
      const { budgetId } = req.params;

      const result = await this.budgetModule.getBudgetsUseCase.executeGetById(budgetId);

      if (!result.success) {
        return handleControllerError(result.error, res);
      }

      if (!result.data) {
        return handleControllerError(new Error('Budget not found'), res);
      }

      return handleControllerSuccess(result.data, res, 200, 'Budget retrieved successfully');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };

  getBudgetSummaries = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;

      if (!userId) {
        return handleControllerError(new Error('User ID is required'), res);
      }

      const result = await this.budgetModule.getBudgetsUseCase.executeGetSummaries(userId);

      if (!result.success) {
        return handleControllerError(result.error, res);
      }

      return handleControllerSuccess(result.data, res, 200, 'Budget summaries retrieved successfully');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };

  updateBudget = async (req: Request, res: Response) => {
    try {
      const { budgetId } = req.params;
      const updateData: UpdateBudgetData = req.body;

      // Convert amount to number if provided
      if (updateData.amount !== undefined) {
        updateData.amount = parseFloat(updateData.amount as any);
      }

      const result = await this.budgetModule.updateBudgetUseCase.execute(budgetId, updateData);

      if (!result.success) {
        return handleControllerError(result.error, res);
      }

      return handleControllerSuccess(result.data, res, 200, 'Budget updated successfully');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };

  deleteBudget = async (req: Request, res: Response) => {
    try {
      const { budgetId } = req.params;

      const result = await this.budgetModule.deleteBudgetUseCase.execute(budgetId);

      if (!result.success) {
        return handleControllerError(result.error, res);
      }

      return handleControllerSuccess(null, res, 200, 'Budget deleted successfully');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };

  recalculateBudgetSpending = async (req: Request, res: Response) => {
    try {
      const { budgetId } = req.params;

      await this.budgetModule.budgetService.recalculateBudgetSpending(budgetId);

      return handleControllerSuccess(null, res, 200, 'Budget spending recalculated successfully');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };

  getBudgetAlerts = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { threshold } = req.query;

      if (!userId) {
        return handleControllerError(new Error('User ID is required'), res);
      }

      const thresholdValue = threshold ? parseFloat(threshold as string) : 0.8;

      const [nearLimit, overBudget] = await Promise.all([
        this.budgetModule.budgetService.getBudgetsNearLimit(userId, thresholdValue),
        this.budgetModule.budgetService.getOverBudgets(userId)
      ]);

      const alerts = {
        nearLimit,
        overBudget,
        totalAlerts: nearLimit.length + overBudget.length
      };

      return handleControllerSuccess(alerts, res, 200, 'Budget alerts retrieved successfully');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };
}