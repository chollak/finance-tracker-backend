import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError } from '../../../shared/domain/errors/AppError';
import { Validators } from '../../../shared/application/validation/validators';
import { RecordEdit, textEdit } from '../domain/recordEdit';

type TextEdits = Pick<RecordEdit, 'description' | 'merchant'>;

/**
 * The note and the merchant an edit of a record writes (#210), checked with the same validators as `POST`
 * (`TransactionValidator`, FT-113): text or `null`, a note within the same limit; then trimmed, and `null`, empty or
 * blank is none (`textEdit`). A field not sent stays undefined: the edit leaves it.
 *
 * Both update use cases call it, so the regular update, the learning one and the bot read these fields alike.
 */
export function noteAndMerchantForUpdate(
  request: { description?: unknown; merchant?: unknown }
): Result<TextEdits, ValidationError> {
  const note = sentText(request.description, value => Validators.description(value));
  if (!note.success) return note;
  const merchant = sentText(request.merchant, value => Validators.string(value, 'merchant'));
  if (!merchant.success) return merchant;
  return ResultHelper.success({ description: note.data, merchant: merchant.data });
}

function sentText(
  sent: unknown,
  check: (value: unknown) => Result<string, ValidationError>
): Result<string | undefined, ValidationError> {
  if (sent === undefined || sent === null) return ResultHelper.success(textEdit(sent));
  const checked = check(sent);
  return checked.success ? ResultHelper.success(textEdit(checked.data)) : checked;
}
