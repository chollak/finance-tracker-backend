import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError } from '../../../shared/domain/errors/AppError';
import { Transaction } from '../domain/transactionEntity';
import { AccountResolver } from '../domain/accountResolver';

/**
 * Moving a record to another account (FT-101, FT-103). The record's currency must end up being the
 * account's: a «55$» parked on a сум account moves to a dollar account as is; a record that should
 * change currency sends the new `currency` (and amount) together with the account. A currency
 * change alone is refused — the account decides the currency.
 */
export async function resolveAccountForUpdate(
  resolver: AccountResolver | undefined,
  existing: Transaction,
  request: { accountId?: string; currency?: 'UZS' | 'USD' }
): Promise<Result<{ accountId?: string; currency?: 'UZS' | 'USD' }>> {
  if (request.accountId === undefined) {
    if (request.currency !== undefined && request.currency !== (existing.currency ?? 'UZS')) {
      return ResultHelper.failure(new ValidationError('currency changes only together with accountId', 'currency'));
    }
    return ResultHelper.success({});
  }
  if (!resolver) return ResultHelper.success({ accountId: request.accountId });

  const account = await resolver.resolveForRecord({ userId: existing.userId, accountId: request.accountId });
  if (!account.success) return ResultHelper.failure(account.error);

  const currency = request.currency ?? existing.currency ?? 'UZS';
  if (currency !== account.data.currency) {
    return ResultHelper.failure(new ValidationError(
      `The record is in ${currency}, the account «${account.data.name}» is in ${account.data.currency}`,
      'accountId'
    ));
  }
  return ResultHelper.success({ accountId: account.data.id, currency });
}
