import { Result } from '../../../shared/domain/types/Result';

/** The account a record is written to (FT-101, FT-103). */
export interface ResolvedAccount {
  id: string;
  name: string;
  currency: 'UZS' | 'USD';
  /** Why this account: picked by id, named in the text, by cash/card, by currency, or the default. */
  matchedBy: 'picked' | 'name' | 'kind' | 'currency' | 'default';
}

export interface AccountResolutionInput {
  userId: string;
  /** Picked by id. Must be the user's and not hidden. */
  accountId?: string;
  /** Words the record was written with: an account whose name appears there is chosen (FT-103). */
  text?: string;
  /**
   * An account named exactly (FT-176: the account a payment's card is mapped to on the phone, typed by hand): the one
   * whose whole name is this, without case and «ё» (`accountNameKey`) — never one whose name only stands in it.
   */
  name?: string;
  /** «нал» → cash, «картой» → card. */
  kind?: 'cash' | 'card';
  /**
   * Currency of the amount. Accounts in it are preferred; without one the default account is
   * returned and the caller sees the mismatch in `currency`.
   */
  currency?: 'UZS' | 'USD';
}

/**
 * Port to the account module: which account a record being written goes to. Implemented by
 * `AccountBook` (modules/account); the transaction module knows only this interface.
 */
export interface AccountResolver {
  resolveForRecord(input: AccountResolutionInput): Promise<Result<ResolvedAccount>>;
}
