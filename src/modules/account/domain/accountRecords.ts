import { Transaction } from '../../transaction/domain/transactionEntity';

/** Port to the transaction module: the records written to one of the user's accounts (FT-104). */
export interface AccountRecordSource {
  recordsOf(userId: string, accountId: string): Promise<Transaction[]>;
}
