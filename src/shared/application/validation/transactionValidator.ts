import { Transaction } from '../../../modules/transaction/domain/transactionEntity';
import { Result, ResultHelper } from '../../domain/types/Result';
import { ValidationError } from '../../domain/errors/AppError';
import { Validators, ValidationChain } from './validators';

export class TransactionValidator {
  static validate(data: any): Result<Transaction, ValidationError[]> {
    const chain = new ValidationChain();

    // Validate required fields
    chain
      .validate(Validators.required(data.amount, 'amount'))
      .validate(Validators.amount(data.amount))
      .validate(Validators.required(data.category, 'category'))
      .validate(Validators.category(data.category))
      .validate(Validators.required(data.description, 'description'))
      .validate(Validators.description(data.description))
      .validate(Validators.required(data.type, 'type'))
      .validate(Validators.transactionType(data.type))
      .validate(Validators.required(data.userId, 'userId'))
      .validate(Validators.string(data.userId, 'userId'));

    // Optional date validation (defaults to today if not provided)
    if (data.date !== undefined && data.date !== null && data.date !== '') {
      chain.validate(Validators.dateString(data.date, 'date'));
    }

    // Optional userName validation
    if (data.userName !== undefined && data.userName !== null) {
      chain.validate(Validators.string(data.userName, 'userName'));
    }

    // Optional merchant validation
    if (data.merchant !== undefined && data.merchant !== null) {
      chain.validate(Validators.string(data.merchant, 'merchant'));
    }

    const validationResult = chain.getResult();
    if (!validationResult.success) {
      return ResultHelper.failure(validationResult.error);
    }

    // If all validations pass, create the transaction object
    // Default date to today if not provided
    const defaultDate = new Date().toISOString().split('T')[0];

    const transaction: Transaction = {
      amount: Number(data.amount),
      category: String(data.category).trim(),
      description: String(data.description).trim(),
      type: data.type as 'income' | 'expense',
      userId: String(data.userId).trim(),
      userName: data.userName ? String(data.userName).trim() : undefined,
      date: data.date ? String(data.date).trim() : defaultDate,
      merchant: data.merchant ? String(data.merchant).trim() : undefined
    };

    return ResultHelper.success(transaction);
  }

  static validatePartial(data: any): Result<Partial<Transaction>, ValidationError[]> {
    const chain = new ValidationChain();

    // Only validate fields that are present
    if (data.amount !== undefined) {
      chain.validate(Validators.amount(data.amount));
    }

    if (data.category !== undefined) {
      chain.validate(Validators.category(data.category));
    }

    if (data.description !== undefined) {
      chain.validate(Validators.description(data.description));
    }

    if (data.type !== undefined) {
      chain.validate(Validators.transactionType(data.type));
    }

    if (data.userId !== undefined) {
      chain.validate(Validators.string(data.userId, 'userId'));
    }

    if (data.date !== undefined) {
      chain.validate(Validators.dateString(data.date, 'date'));
    }

    if (data.userName !== undefined) {
      chain.validate(Validators.string(data.userName, 'userName'));
    }

    if (data.merchant !== undefined) {
      chain.validate(Validators.string(data.merchant, 'merchant'));
    }

    const validationResult = chain.getResult();
    if (!validationResult.success) {
      return ResultHelper.failure(validationResult.error);
    }

    // Create partial transaction object with validated fields
    const partialTransaction: Partial<Transaction> = {};

    if (data.amount !== undefined) partialTransaction.amount = Number(data.amount);
    if (data.category !== undefined) partialTransaction.category = String(data.category).trim();
    if (data.description !== undefined) partialTransaction.description = String(data.description).trim();
    if (data.type !== undefined) partialTransaction.type = data.type;
    if (data.userId !== undefined) partialTransaction.userId = String(data.userId).trim();
    if (data.date !== undefined) partialTransaction.date = String(data.date).trim();
    if (data.userName !== undefined) partialTransaction.userName = String(data.userName).trim();
    if (data.merchant !== undefined) partialTransaction.merchant = String(data.merchant).trim();

    return ResultHelper.success(partialTransaction);
  }
}