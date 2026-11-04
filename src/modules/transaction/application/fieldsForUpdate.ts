import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError } from '../../../shared/domain/errors/AppError';
import { Validators } from '../../../shared/application/validation/validators';
import { RecordEdit, textEdit } from '../domain/recordEdit';
import { isTransactionSemanticType, TransactionSemanticType } from '../domain/transactionSemanticType';

/** The fields of an update request this check reads; the other ones are resolved against the record. */
export interface FieldsOfUpdate {
  amount?: unknown;
  amountMinor?: unknown;
  category?: string;
  date?: string;
  type?: 'income' | 'expense';
  semanticType?: unknown;
  needsReview?: unknown;
  description?: unknown;
  merchant?: unknown;
}

/** What the edit writes as sent, once checked: everything but the category and the account. */
type CheckedFields = Pick<RecordEdit,
  'amountMinor' | 'description' | 'date' | 'type' | 'semanticType' | 'needsReview' | 'merchant'
>;

/**
 * The fields of an edit of a record, checked before the record is read (#229). One check for the regular update and
 * the learning one, so both refuse the same body with the same `400 VALIDATION_ERROR` and a refused body writes
 * nothing; before, the learning copy did not check `semanticType` and `needsReview`.
 *
 * The note and the merchant are checked with the validators of `POST` (`TransactionValidator`, FT-113, #210): text or
 * `null`, a note within the same limit; then trimmed, and `null`, empty or blank is none (`textEdit`). A field not sent
 * stays undefined: the edit leaves it. Not `TransactionValidator.validatePartial()`: it refuses `description: null`,
 * which clears the note (FT-249).
 */
export function fieldsForUpdate(request: FieldsOfUpdate): Result<CheckedFields, ValidationError> {
  const amountMinor = amountOf(request);
  if (!amountMinor.success) return amountMinor;
  const refused = refusedCategoryDateOrType(request);
  if (refused) return ResultHelper.failure(refused);
  const semanticType = semanticTypeOf(request.semanticType);
  if (!semanticType.success) return semanticType;
  const needsReview = needsReviewOf(request.needsReview);
  if (!needsReview.success) return needsReview;
  const note = sentText(request.description, value => Validators.description(value));
  if (!note.success) return note;
  const merchant = sentText(request.merchant, value => Validators.string(value, 'merchant'));
  if (!merchant.success) return merchant;

  return ResultHelper.success({
    amountMinor: amountMinor.data,
    description: note.data,
    date: request.date,
    type: request.type,
    semanticType: semanticType.data,
    needsReview: needsReview.data,
    merchant: merchant.data,
  });
}

/** The new `amountMinor` or the legacy `amount` in сум (FT-097), within the limits of `POST`. */
function amountOf(request: FieldsOfUpdate): Result<number | undefined, ValidationError> {
  if (request.amount === undefined && request.amountMinor === undefined) return ResultHelper.success(undefined);
  return Validators.moneyAmount(request);
}

function refusedCategoryDateOrType({ category, date, type }: FieldsOfUpdate): ValidationError | undefined {
  if (category !== undefined && !category.trim()) {
    return new ValidationError('Category cannot be empty');
  }
  if (date !== undefined && !isDayString(date)) {
    return new ValidationError('Invalid date format. Use YYYY-MM-DD');
  }
  if (type !== undefined && !['income', 'expense'].includes(type)) {
    return new ValidationError('Type must be "income" or "expense"');
  }
  return undefined;
}

function isDayString(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(new Date(date).getTime());
}

function semanticTypeOf(sent: unknown): Result<TransactionSemanticType | undefined, ValidationError> {
  if (sent === undefined || isTransactionSemanticType(sent)) return ResultHelper.success(sent);
  return ResultHelper.failure(new ValidationError('Invalid semanticType'));
}

function needsReviewOf(sent: unknown): Result<boolean | undefined, ValidationError> {
  if (sent === undefined || typeof sent === 'boolean') return ResultHelper.success(sent);
  return ResultHelper.failure(new ValidationError('needsReview must be a boolean'));
}

function sentText(
  sent: unknown,
  check: (value: unknown) => Result<string, ValidationError>
): Result<string | undefined, ValidationError> {
  if (sent === undefined || sent === null) return ResultHelper.success(textEdit(sent));
  const checked = check(sent);
  return checked.success ? ResultHelper.success(textEdit(checked.data)) : checked;
}
