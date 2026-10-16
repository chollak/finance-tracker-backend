import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { BusinessLogicError, NotFoundError, ValidationError } from '../../../shared/domain/errors/AppError';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { isValidDateOnly } from '../../../shared/domain/dates/dateOnly';
import { Transaction } from '../../transaction/domain/transactionEntity';
import { AccountWithBalance } from '../domain/account';
import { AccountMove, MoveKind, moveChangeFor } from '../domain/accountMove';
import { AccountMoveRepository } from '../domain/accountMoveRepository';
import { AccountRecordSource } from '../domain/accountRecords';
import { AccountBook } from './accountBook';

const logger = getLogger(LogCategory.TRANSACTION);

interface OperationBase {
  id: string;
  date: string;
  /** ISO; orders operations inside a day, newest first. */
  createdAt: string | null;
  /** Signed change of this account's balance, minor units of its currency. */
  amountMinor: number;
  /** False for operations dated before the opening date, or a record in another currency. */
  countsInBalance: boolean;
}

export interface RecordOperation extends OperationBase {
  type: 'record';
  record: Transaction;
}

export interface MoveOperation extends OperationBase {
  type: 'move';
  kind: MoveKind;
  /** The other account of a transfer or an exchange; null for an adjustment. */
  counterpart: { id: string; name: string; currency: 'UZS' | 'USD' } | null;
  move: AccountMove;
}

export type AccountOperation = RecordOperation | MoveOperation;

export interface AccountOperations {
  account: AccountWithBalance;
  days: Array<{ date: string; operations: AccountOperation[] }>;
}

/**
 * The account screen (FT-104, design-system «Экран счёта»): the account with its balance and its
 * records and moves by day, newest first. Records are the same as in history; moves are only here.
 */
export class GetAccountOperationsUseCase {
  constructor(private book: AccountBook, private moves: AccountMoveRepository, private records?: AccountRecordSource) {}

  setRecordSource(records: AccountRecordSource): void {
    this.records = records;
  }

  async execute(input: { userId: string; accountId: string; from?: unknown; to?: unknown }): Promise<Result<AccountOperations>> {
    try {
      for (const [field, value] of [['from', input.from], ['to', input.to]] as const) {
        if (value !== undefined && !isValidDateOnly(value)) {
          return ResultHelper.failure(new ValidationError(`${field} must be a date YYYY-MM-DD`, field));
        }
      }
      const summary = await this.book.summary(input.userId);
      const account = summary.accounts.find(candidate => candidate.id === input.accountId);
      if (!account) return ResultHelper.failure(new NotFoundError('Account', input.accountId));

      const inRange = (date: string) =>
        (input.from === undefined || date >= (input.from as string)) && (input.to === undefined || date <= (input.to as string));
      const counts = (date: string) => date >= account.openingDate;
      const names = new Map(summary.accounts.map(candidate => [candidate.id, candidate]));

      const records = this.records ? await this.records.recordsOf(input.userId, account.id) : [];
      const recordOperations: AccountOperation[] = records.filter(record => inRange(record.date)).map(record => {
        const amountMinor = record.amountMinor ?? 0;
        return {
          type: 'record',
          id: record.id!,
          date: record.date,
          createdAt: record.createdAt ?? null,
          amountMinor: record.type === 'income' ? amountMinor : -amountMinor,
          countsInBalance: counts(record.date) && (record.currency ?? 'UZS') === account.currency,
          record,
        };
      });

      const moves = await this.moves.findByAccount(account.id);
      const moveOperations: AccountOperation[] = moves.filter(move => inRange(move.date)).map(move => {
        const otherId = move.fromAccountId === account.id ? move.toAccountId : move.fromAccountId;
        const other = otherId ? names.get(otherId) : undefined;
        return {
          type: 'move',
          id: move.id,
          date: move.date,
          createdAt: move.createdAt.toISOString(),
          amountMinor: moveChangeFor(move, account.id),
          countsInBalance: counts(move.date),
          kind: move.kind,
          counterpart: other ? { id: other.id, name: other.name, currency: other.currency } : null,
          move,
        };
      });

      const byDay = new Map<string, AccountOperation[]>();
      for (const operation of [...recordOperations, ...moveOperations]) {
        const day = byDay.get(operation.date) ?? [];
        day.push(operation);
        byDay.set(operation.date, day);
      }
      const days = [...byDay.entries()]
        .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
        .map(([date, operations]) => ({
          date,
          operations: operations.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
        }));
      return ResultHelper.success({ account, days });
    } catch (error) {
      logger.error('Failed to read account operations', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to read account operations'));
    }
  }
}
