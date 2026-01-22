import { Request, Response } from 'express';
import { DebtModule } from '../../debtModule';
import { CreateDebtData, UpdateDebtData, DebtType, DebtStatus, DebtEntity } from '../../domain/debtEntity';
import { handleControllerError, handleControllerSuccess } from '../../../../shared/infrastructure/utils/controllerHelpers';
import { ErrorFactory } from '../../../../shared/domain/errors/AppError';
import { UserModule } from '../../../user/userModule';
import { verifyResourceOwnership } from '../../../../shared/infrastructure/utils/ownershipVerification';
// Import for type extensions on Express.Request (telegramUser, resolvedUser)
import '../../../../delivery/web/express/middleware/authMiddleware';
import '../../../../delivery/web/express/middleware/userResolutionMiddleware';

export class DebtController {
  private userModule?: UserModule;

  constructor(private debtModule: DebtModule, userModule?: UserModule) {
    this.userModule = userModule;
  }

  /**
   * Fetch debt and verify ownership
   * Uses shared verifyResourceOwnership helper for consistent behavior
   */
  private async verifyDebtOwnership(req: Request, debtId: string): Promise<DebtEntity> {
    const result = await this.debtModule.getDebtsUseCase.executeGetById(debtId);

    if (!result.success || !result.data) {
      throw ErrorFactory.notFound('Debt not found');
    }

    const debt = result.data;
    await verifyResourceOwnership(req, debt, this.userModule, { resourceType: 'debt' });

    return debt;
  }

  // ==================== DEBT CRUD ====================

  createDebt = async (req: Request, res: Response) => {
    try {
      // Use resolved UUID from middleware
      const userId = req.resolvedUser?.id || req.params.userId;
      const { type, personName, amount, currency, description, dueDate, moneyTransferred } = req.body;

      if (!userId) {
        return handleControllerError(new Error('User ID is required'), res);
      }

      const data: CreateDebtData = {
        userId,
        type: type as DebtType,
        personName,
        amount: parseFloat(amount),
        currency,
        description,
        dueDate,
        moneyTransferred: moneyTransferred === true || moneyTransferred === 'true'
      };

      const result = await this.debtModule.createDebtUseCase.execute(data);

      if (!result.success) {
        return handleControllerError(result.error, res);
      }

      return handleControllerSuccess(result.data, res, 201, 'Debt created successfully');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };

  getDebts = async (req: Request, res: Response) => {
    try {
      // Use resolved UUID from middleware
      const userId = req.resolvedUser?.id || req.params.userId;
      const { status, type } = req.query;

      if (!userId) {
        return handleControllerError(new Error('User ID is required'), res);
      }

      let result;

      if (type) {
        result = await this.debtModule.getDebtsUseCase.executeGetByType(
          userId,
          type as DebtType
        );
      } else {
        result = await this.debtModule.getDebtsUseCase.executeGetAll(
          userId,
          status as DebtStatus | undefined
        );
      }

      if (!result.success) {
        return handleControllerError(result.error, res);
      }

      return handleControllerSuccess(result.data, res, 200, 'Debts retrieved successfully');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };

  getDebt = async (req: Request, res: Response) => {
    try {
      const { debtId } = req.params;
      const { withPayments } = req.query;

      if (!debtId) {
        return handleControllerError(new Error('Debt ID is required'), res);
      }

      // Verify ownership first
      await this.verifyDebtOwnership(req, debtId);

      const result = withPayments === 'true'
        ? await this.debtModule.getDebtsUseCase.executeGetWithPayments(debtId)
        : await this.debtModule.getDebtsUseCase.executeGetById(debtId);

      if (!result.success) {
        return handleControllerError(result.error, res);
      }

      if (!result.data) {
        return handleControllerError(new Error('Debt not found'), res);
      }

      return handleControllerSuccess(result.data, res, 200, 'Debt retrieved successfully');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };

  updateDebt = async (req: Request, res: Response) => {
    try {
      const { debtId } = req.params;
      const updateData: UpdateDebtData = req.body;

      if (!debtId) {
        return handleControllerError(new Error('Debt ID is required'), res);
      }

      // Verify ownership first
      await this.verifyDebtOwnership(req, debtId);

      const result = await this.debtModule.updateDebtUseCase.execute(debtId, updateData);

      if (!result.success) {
        return handleControllerError(result.error, res);
      }

      return handleControllerSuccess(result.data, res, 200, 'Debt updated successfully');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };

  deleteDebt = async (req: Request, res: Response) => {
    try {
      const { debtId } = req.params;

      if (!debtId) {
        return handleControllerError(new Error('Debt ID is required'), res);
      }

      // Verify ownership first
      await this.verifyDebtOwnership(req, debtId);

      const result = await this.debtModule.deleteDebtUseCase.execute(debtId);

      if (!result.success) {
        return handleControllerError(result.error, res);
      }

      return handleControllerSuccess(null, res, 200, 'Debt deleted successfully');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };

  cancelDebt = async (req: Request, res: Response) => {
    try {
      const { debtId } = req.params;

      if (!debtId) {
        return handleControllerError(new Error('Debt ID is required'), res);
      }

      // Verify ownership first
      await this.verifyDebtOwnership(req, debtId);

      const result = await this.debtModule.updateDebtUseCase.executeCancel(debtId);

      if (!result.success) {
        return handleControllerError(result.error, res);
      }

      return handleControllerSuccess(result.data, res, 200, 'Debt cancelled successfully');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };

  // ==================== PAYMENTS ====================

  payDebt = async (req: Request, res: Response) => {
    try {
      const { debtId } = req.params;
      const { amount, note, createTransaction } = req.body;

      if (!debtId) {
        return handleControllerError(new Error('Debt ID is required'), res);
      }

      // Verify ownership first
      await this.verifyDebtOwnership(req, debtId);

      // Default to true - create transaction unless explicitly set to false
      const shouldCreateTransaction = createTransaction !== false && createTransaction !== 'false';

      const result = await this.debtModule.payDebtUseCase.execute({
        debtId,
        amount: parseFloat(amount),
        note
      }, shouldCreateTransaction);

      if (!result.success) {
        return handleControllerError(result.error, res);
      }

      return handleControllerSuccess(result.data, res, 201, 'Payment recorded successfully');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };

  payDebtFull = async (req: Request, res: Response) => {
    try {
      const { debtId } = req.params;
      const { note, createTransaction } = req.body;

      if (!debtId) {
        return handleControllerError(new Error('Debt ID is required'), res);
      }

      // Verify ownership first
      await this.verifyDebtOwnership(req, debtId);

      // Default to true - create transaction unless explicitly set to false
      const shouldCreateTransaction = createTransaction !== false && createTransaction !== 'false';

      const result = await this.debtModule.payDebtUseCase.executePayFull(debtId, note, shouldCreateTransaction);

      if (!result.success) {
        return handleControllerError(result.error, res);
      }

      return handleControllerSuccess(result.data, res, 201, 'Debt paid in full');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };

  deletePayment = async (req: Request, res: Response) => {
    try {
      const { paymentId } = req.params;

      if (!paymentId) {
        return handleControllerError(new Error('Payment ID is required'), res);
      }

      // Get payment to find associated debt
      const paymentResult = await this.debtModule.payDebtUseCase.executeGetPaymentById(paymentId);
      if (!paymentResult.success || !paymentResult.data) {
        return handleControllerError(ErrorFactory.notFound('Payment not found'), res);
      }

      // Verify ownership of the associated debt
      await this.verifyDebtOwnership(req, paymentResult.data.debtId);

      const result = await this.debtModule.payDebtUseCase.executeDeletePayment(paymentId);

      if (!result.success) {
        return handleControllerError(result.error, res);
      }

      return handleControllerSuccess(null, res, 200, 'Payment deleted successfully');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };

  // ==================== SUMMARY ====================

  getSummary = async (req: Request, res: Response) => {
    try {
      // Use resolved UUID from middleware
      const userId = req.resolvedUser?.id || req.params.userId;

      if (!userId) {
        return handleControllerError(new Error('User ID is required'), res);
      }

      const result = await this.debtModule.getDebtsUseCase.executeGetSummary(userId);

      if (!result.success) {
        return handleControllerError(result.error, res);
      }

      return handleControllerSuccess(result.data, res, 200, 'Debt summary retrieved successfully');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };
}
