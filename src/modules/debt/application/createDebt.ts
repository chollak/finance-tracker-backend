import { DebtRepository } from '../domain/debtRepository';
import { DebtEntity, CreateDebtData, DebtType } from '../domain/debtEntity';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError, BusinessLogicError } from '../../../shared/domain/errors/AppError';
import { CreateTransactionUseCase } from '../../transaction/application/createTransaction';

// Debt-related category for transactions
const DEBT_CATEGORY = 'debt';

export class CreateDebtUseCase {
  constructor(
    private debtRepository: DebtRepository,
    private createTransactionUseCase: CreateTransactionUseCase
  ) {}

  async execute(data: CreateDebtData): Promise<Result<DebtEntity>> {
    try {
      const validation = this.validate(data);
      if (!validation.isValid) {
        return ResultHelper.failure(new ValidationError(validation.error!));
      }

      // Create the debt first
      const debt = await this.debtRepository.create(data);

      // If money was actually transferred, create a linked transaction
      if (data.moneyTransferred) {
        await this.createLinkedTransaction(debt, data);
        // Transaction is created and linked via isDebtRelated + relatedDebtId fields
      }

      return ResultHelper.success(debt);
    } catch (error) {
      console.error('Error creating debt:', error);
      return ResultHelper.failure(new BusinessLogicError('Failed to create debt'));
    }
  }

  private async createLinkedTransaction(debt: DebtEntity, data: CreateDebtData): Promise<string> {
    // Determine transaction type based on debt type:
    // - "I owe someone" = I received money from them = income (but it's a debt)
    // - "Someone owes me" = I gave money to them = expense (but it's recoverable)

    const isExpense = data.type === DebtType.OWED_TO_ME; // I gave money

    const description = data.type === DebtType.OWED_TO_ME
      ? `Дал в долг: ${debt.personName}`
      : `Взял в долг у: ${debt.personName}`;

    return this.createTransactionUseCase.execute({
      userId: debt.userId,
      amount: debt.originalAmount,
      type: isExpense ? 'expense' : 'income',
      category: DEBT_CATEGORY,
      description: data.description || description,
      date: new Date().toISOString().split('T')[0],
      isDebtRelated: true,
      relatedDebtId: debt.id
    });
  }

  private validate(data: CreateDebtData): { isValid: boolean; error?: string } {
    if (!data.userId?.trim()) {
      return { isValid: false, error: 'User ID is required' };
    }

    if (!data.personName?.trim()) {
      return { isValid: false, error: 'Person name is required' };
    }

    if (!data.amount || data.amount <= 0) {
      return { isValid: false, error: 'Amount must be greater than 0' };
    }

    if (!data.type || !Object.values(DebtType).includes(data.type)) {
      return { isValid: false, error: 'Invalid debt type' };
    }

    return { isValid: true };
  }
}
