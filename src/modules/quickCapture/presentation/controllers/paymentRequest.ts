import { Result, ResultHelper } from '../../../../shared/domain/types/Result';
import { ValidationError } from '../../../../shared/domain/errors/AppError';
import { Validators } from '../../../../shared/application/validation/validators';
import { isRecordCurrency } from '../../../transaction/domain/recordSource';
import { isClientId } from '../../../transaction/domain/clientId';
import { parseCapturedAt } from '../../domain/capturedAt';
import { PAYMENT_NAME_LIMITS, paymentAmountMinor, paymentName } from '../../domain/paymentCapture';
import { PaymentCaptureRequest } from '../../domain/quickCaptureTypes';

/** The fields of a payment the body carries; who it is for comes from the auth middleware. */
export type PaymentFields = Omit<PaymentCaptureRequest, 'userId' | 'userName'>;

const AMOUNT_FORMAT = 'amount must be a decimal string of сум or dollars with a dot, like "25000" or "4.50"';

function refused<T>(message: string, field: string): Result<T, ValidationError> {
  return ResultHelper.failure(new ValidationError(message, field));
}

/** An optional name: absent, null or blank is none; anything else must be a string within the limit. */
function optionalName(value: unknown, field: string, limit: number): Result<string | undefined, ValidationError> {
  if (value === undefined || value === null) return ResultHelper.success(undefined);
  const name = typeof value === 'string' ? paymentName(value) : null;
  if (name === null || (name !== undefined && name.length > limit)) {
    return refused(`${field} must be a string of up to ${limit} characters`, field);
  }
  return ResultHelper.success(name);
}

/**
 * Reads a payment from the body of `POST /api/quick-capture/payment` (FT-176), in the order the contract lists the
 * errors: amount, currency, merchant, accountName, clientId, capturedAt. The limits of `capturedAt` are checked by the
 * service, after a repeat is answered (FT-175).
 */
export function readPayment(body: Record<string, unknown>): Result<PaymentFields, ValidationError> {
  const amountMinor = paymentAmountMinor(body.amount);
  if (amountMinor === null) return refused(AMOUNT_FORMAT, 'amount');
  const inRange = Validators.moneyAmount({ amountMinor });
  if (!inRange.success) return refused(inRange.error.message, 'amount');

  const { currency } = body;
  if (!isRecordCurrency(currency)) return refused('currency must be UZS or USD', 'currency');

  const merchant = optionalName(body.merchant, 'merchant', PAYMENT_NAME_LIMITS.merchant);
  if (!merchant.success) return merchant;
  const accountName = optionalName(body.accountName, 'accountName', PAYMENT_NAME_LIMITS.accountName);
  if (!accountName.success) return accountName;

  const { clientId } = body;
  if (!isClientId(clientId)) {
    return refused('clientId is required for a payment: up to 64 letters, digits or «-»', 'clientId');
  }

  const capturedAt = body.capturedAt === undefined || body.capturedAt === null ? undefined : parseCapturedAt(body.capturedAt);
  if (capturedAt === null) {
    return refused('capturedAt must be an ISO 8601 time with seconds and a time zone, like 2026-10-27T09:15:00+05:00', 'capturedAt');
  }

  return ResultHelper.success({
    amountMinor,
    currency,
    clientId,
    ...(merchant.data ? { merchant: merchant.data } : {}),
    ...(accountName.data ? { accountName: accountName.data } : {}),
    ...(capturedAt ? { capturedAt } : {}),
  });
}
