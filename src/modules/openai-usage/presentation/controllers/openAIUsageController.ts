import { Request, Response } from 'express';
import { GetOpenAIUsage } from '../../application/getOpenAIUsage';
import { handleControllerError, handleControllerSuccess } from '../../../../shared/infrastructure/utils/controllerHelpers';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.OPENAI);

export class OpenAIUsageController {
  constructor(private readonly getOpenAIUsage: GetOpenAIUsage) {}

  async getUsage(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, forceRefresh } = req.query;
      
      const request = {
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        forceRefresh: forceRefresh === 'true'
      };

      const result = await this.getOpenAIUsage.execute(request);

      if (!result.success) {
        handleControllerError(result.error, res);
        return;
      }

      handleControllerSuccess(result.data, res, 200, 'OpenAI usage data retrieved successfully');
    } catch (error) {
      logger.error('Error in OpenAI usage controller', error as Error);
      handleControllerError(error, res);
    }
  }

  async getUsageSummary(_req: Request, res: Response): Promise<void> {
    try {
      const result = await this.getOpenAIUsage.execute({ forceRefresh: false });

      if (!result.success) {
        handleControllerError(result.error, res);
        return;
      }

      // Return only the summary for lightweight requests
      const summary = {
        summary: result.data.summary,
        alerts: this.generateAlerts(result.data.summary),
        creditBalance: result.data.creditBalance
      };

      handleControllerSuccess(summary, res, 200, 'OpenAI usage summary retrieved successfully');
    } catch (error) {
      logger.error('Error in OpenAI usage summary controller', error as Error);
      handleControllerError(error, res);
    }
  }

  async refreshUsage(_req: Request, res: Response): Promise<void> {
    try {
      const result = await this.getOpenAIUsage.execute({ forceRefresh: true });

      if (!result.success) {
        handleControllerError(result.error, res);
        return;
      }

      handleControllerSuccess(result.data, res, 200, 'OpenAI usage data refreshed successfully');
    } catch (error) {
      logger.error('Error in OpenAI usage refresh controller', error as Error);
      handleControllerError(error, res);
    }
  }

  private generateAlerts(summary: any): Array<{ level: 'info' | 'warning' | 'danger'; message: string }> {
    const alerts = [];
    const costPercentage = summary.utilization.costPercentage;

    if (costPercentage >= 90) {
      alerts.push({
        level: 'danger' as const,
        message: `Critical: You've used ${costPercentage.toFixed(1)}% of your OpenAI budget!`
      });
    } else if (costPercentage >= 75) {
      alerts.push({
        level: 'warning' as const,
        message: `Warning: You've used ${costPercentage.toFixed(1)}% of your OpenAI budget.`
      });
    } else if (costPercentage >= 50) {
      alerts.push({
        level: 'info' as const,
        message: `You've used ${costPercentage.toFixed(1)}% of your OpenAI budget.`
      });
    }

    const remainingBudget = summary.limits.hardLimit - summary.currentUsage.totalCost;
    if (remainingBudget <= 5 && remainingBudget > 0) {
      alerts.push({
        level: 'warning' as const,
        message: `Only $${remainingBudget.toFixed(2)} remaining in your OpenAI budget.`
      });
    }

    return alerts;
  }
}