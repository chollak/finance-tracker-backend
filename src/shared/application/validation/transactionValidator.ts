import { Transaction } from '../../../modules/transaction/domain/transactionEntity';
import { Result, ResultHelper } from '../../domain/types/Result';
import { ValidationError } from '../../domain/errors/AppError';
import { Validators, ValidationChain } from './validators';
import { normalizeSemanticType } from '../../../modules/transaction/domain/transactionSemanticType';
import { fromMinor } from '../../domain/money/money';

export class TransactionValidator {
  static validate(data: any): Result<Transaction, ValidationError[]> {
    const chain = new ValidationChain();

    // Amount: new writers send amountMinor (integer minor units), old ones amount in сум (FT-097)
    const amountMinor = Validators.moneyAmount(data);

    // Category: new writers send categoryId, old ones a category id/name (FT-099)
    const hasCategoryId = data.categoryId !== undefined && data.categoryId !== null && data.categoryId !== '';
    if (hasCategoryId) {
      chain.validate(Validators.string(data.categoryId, 'categoryId'));
    } else {
      chain
        .validate(Validators.required(data.category, 'category'))
        .validate(Validators.category(data.category));
    }

    // Validate required fields
    chain
      .validate(amountMinor)
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

    // Optional semanticType validation - only checked when explicitly provided
    if (data.semanticType !== undefined && data.semanticType !== null) {
      chain.validate(Validators.transactionSemanticType(data.semanticType));
    }

    // Optional needsReview validation - only checked when explicitly provided
    if (data.needsReview !== undefined && data.needsReview !== null) {
      chain.validate(Validators.boolean(data.needsReview, 'needsReview'));
    }

    const validationResult = chain.getResult();
    if (!validationResult.success) {
      return ResultHelper.failure(validationResult.error);
    }
    if (!amountMinor.success) {
      return ResultHelper.failure([amountMinor.error]); // already in the chain; narrows the type
    }

    // If all validations pass, create the transaction object
    // Default date to today if not provided
    const defaultDate = new Date().toISOString().split('T')[0];

    const transaction: Transaction = {
      amountMinor: amountMinor.data,
      amount: fromMinor(amountMinor.data),
      category: hasCategoryId ? '' : String(data.category).trim(),
      categoryId: hasCategoryId ? String(data.categoryId).trim() : undefined,
      description: String(data.description).trim(),
      type: data.type as 'income' | 'expense',
      semanticType: normalizeSemanticType(data.semanticType, data.type as 'income' | 'expense'),
      needsReview: data.needsReview === true,
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
    const hasAmount = data.amount !== undefined || data.amountMinor !== undefined;
    const amountMinor = hasAmount ? Validators.moneyAmount(data) : undefined;
    if (amountMinor) {
      chain.validate(amountMinor);
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

    if (data.semanticType !== undefined) {
      chain.validate(Validators.transactionSemanticType(data.semanticType));
    }

    if (data.needsReview !== undefined) {
      chain.validate(Validators.boolean(data.needsReview, 'needsReview'));
    }

    const validationResult = chain.getResult();
    if (!validationResult.success) {
      return ResultHelper.failure(validationResult.error);
    }

    // Create partial transaction object with validated fields
    const partialTransaction: Partial<Transaction> = {};

    if (amountMinor?.success) {
      partialTransaction.amountMinor = amountMinor.data;
      partialTransaction.amount = fromMinor(amountMinor.data);
    }
    if (data.category !== undefined) partialTransaction.category = String(data.category).trim();
    if (data.categoryId !== undefined) partialTransaction.categoryId = String(data.categoryId).trim();
    if (data.description !== undefined) partialTransaction.description = String(data.description).trim();
    if (data.type !== undefined) partialTransaction.type = data.type;
    if (data.semanticType !== undefined) partialTransaction.semanticType = data.semanticType;
    if (data.needsReview !== undefined) partialTransaction.needsReview = data.needsReview;
    if (data.userId !== undefined) partialTransaction.userId = String(data.userId).trim();
    if (data.date !== undefined) partialTransaction.date = String(data.date).trim();
    if (data.userName !== undefined) partialTransaction.userName = String(data.userName).trim();
    if (data.merchant !== undefined) partialTransaction.merchant = String(data.merchant).trim();

    return ResultHelper.success(partialTransaction);
  }
}