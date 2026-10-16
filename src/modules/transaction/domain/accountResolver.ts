import { Result } from '../../../shared/domain/types/Result';

/** The account a record is written to (FT-101). */
export interface ResolvedAccount {
  id: string;
  name: string;
  currency: 'UZS' | 'USD';
}

export interface AccountResolutionInput {
  userId: string;
  /** Picked by id. Must be the user's and not hidden. Without it, the default account. */
  accountId?: string;
}

/**
 * Port to the account module: which account a record being written goes to. Implemented by
 * `AccountBook` (modules/account); the transaction module knows only this interface.
 */
export interface AccountResolver {
  resolveForRecord(input: AccountResolutionInput): Promise<Result<ResolvedAccount>>;
}
