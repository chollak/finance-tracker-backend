import { Request, Response } from 'express';
import { BudgetModule } from '../budgetModule';
import { CreateBudgetData, UpdateBudgetData, BudgetPeriod, BudgetEntity } from '../domain/budgetEntity';
import { handleControllerError, handleControllerSuccess } from '../../../shared/infrastructure/utils/controllerHelpers';
import { ErrorFactory } from '../../../shared/domain/errors/AppError';
import { UserModule } from '../../user/userModule';
import { verifyResourceOwnership } from '../../../shared/infrastructure/utils/ownershipVerification';
// Import for type extensions on Express.Request (telegramUser, resolvedUser)
import '../../../delivery/web/express/middleware/authMiddleware';
import '../../../delivery/web/express/middleware/userResolutionMiddleware';

/**
 * BudgetController
 * Note: userId resolution (telegramId → UUID) is handled by userResolutionMiddleware.
 * All methods use req.resolvedUser.id (always UUID) or fallback to req.params.userId.
 */
export class BudgetController {
  private budgetModule: BudgetModule;
  private userModule?: UserModule;

  constructor(budgetModule: BudgetModule, userModule?: UserModule) {
    this.budgetModule = budgetModule;
    this.userModule = userModule;
  }

  /**
   * Fetch budget and verify ownership
   * Uses shared verifyResourceOwnership helper for consistent behavior
   */
  private async verifyBudgetOwnership(req: Request, budgetId: string): Promise<BudgetEntity> {
    const result = await this.budgetModule.getBudgetsUseCase.executeGetById(budgetId);

    if (!result.success || !result.data) {
      throw ErrorFactory.notFound('Budget not found');
    }

    const budget = result.data;
    await verifyResourceOwnership(req, budget, this.userModule, { resourceType: 'budget' });

    return budget;
  }

  createBudget = async (req: Request, res: Response) => {
    try {
      const { name, amount, period, startDate, endDate, categoryIds, description } = req.body;
      // Use resolved UUID from middleware, fallback to raw param
      const userId = req.resolvedUser?.id || req.params.userId;

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
        userId // Always UUID after middleware resolution
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
      // Use resolved UUID from middleware, fallback to raw param
      const userId = req.resolvedUser?.id || req.params.userId;
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

      // Verify ownership before returning budget
      const budget = await this.verifyBudgetOwnership(req, budgetId);

      return handleControllerSuccess(budget, res, 200, 'Budget retrieved successfully');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };

  getBudgetSummaries = async (req: Request, res: Response) => {
    try {
      // Use resolved UUID from middleware, fallback to raw param
      const userId = req.resolvedUser?.id || req.params.userId;

      if (!userId) {
        return handleControllerError(new Error('User ID is required'), res);
      }

      // Recalculate spent amounts before returning summaries
      await this.budgetModule.budgetService.recalculateAllUserBudgets(userId);

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

      // Verify ownership before updating
      await this.verifyBudgetOwnership(req, budgetId);

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

      // Verify ownership before deleting
      await this.verifyBudgetOwnership(req, budgetId);

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

      // Verify ownership before recalculating
      await this.verifyBudgetOwnership(req, budgetId);

      await this.budgetModule.budgetService.recalculateBudgetSpending(budgetId);

      return handleControllerSuccess(null, res, 200, 'Budget spending recalculated successfully');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };

  getBudgetAlerts = async (req: Request, res: Response) => {
    try {
      // Use resolved UUID from middleware, fallback to raw param
      const userId = req.resolvedUser?.id || req.params.userId;
      const { threshold } = req.query;

      if (!userId) {
        return handleControllerError(new Error('User ID is required'), res);
      }

      // Recalculate spent amounts before checking alerts
      await this.budgetModule.budgetService.recalculateAllUserBudgets(userId);

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