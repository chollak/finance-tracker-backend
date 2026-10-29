import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { BusinessLogicError, NotFoundError, ValidationError } from '../../../shared/domain/errors/AppError';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { isValidDateOnly } from '../../../shared/domain/dates/dateOnly';
import { Transaction } from '../../transaction/domain/transactionEntity';
import { AccountWithBalance, countsInBalance } from '../domain/account';
import { AccountMove, MoveKind, moveChangeFor } from '../domain/accountMove';
import { AccountMoveRepository } from '../domain/accountMoveRepository';
import { AccountRecordSource } from '../domain/accountRecords';
import { AccountRepository } from '../domain/accountRepository';
import { AccountBook } from './accountBook';

const logger = getLogger(LogCategory.TRANSACTION);

interface OperationBase {
  id: string;
  date: string;
  /** ISO; orders operations inside a day, newest first. */
  createdAt: string | null;
  /** Signed change of this account's balance, minor units of its currency. */
  amountMinor: number;
  /**
   * False for operations dated before the opening date, those of the opening day written before the first launch
   * entered the opening balance (FT-163), or a record in another currency.
   */
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
  /**
   * `hasOperations`: the account has records or moves, deleted ones too (FT-118) — its currency can no longer
   * change, even when nothing is listed.
   */
  account: AccountWithBalance & { hasOperations: boolean };
  days: Array<{ date: string; operations: AccountOperation[] }>;
  /**
   * With `from`: the day of the newest operation before it, where the screen reads the next window back from
   * (FT-118); null when there is nothing earlier, or without `from`.
   */
  earlierDate: string | null;
}

/**
 * The account screen (FT-104, design-system «Экран счёта»): the account with its balance and its
 * records and moves by day, newest first. Records are the same as in history; moves are only here.
 */
export class GetAccountOperationsUseCase {
  constructor(
    private book: AccountBook,
    private moves: AccountMoveRepository,
    private accounts: Pick<AccountRepository, 'hasOperations'>,
    private records?: AccountRecordSource
  ) {}

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

      const from = input.from as string | undefined;
      const to = input.to as string | undefined;
      // Older records may keep a full moment in `date` (written before FT-100); they belong to its day
      const dayOf = (stored: string) => stored.slice(0, 10);
      const inRange = (stored: string) => {
        const date = dayOf(stored);
        return (from === undefined || date >= from) && (to === undefined || date <= to);
      };
      let earlierDate: string | null = null;
      const noteEarlier = (stored: string) => {
        const date = dayOf(stored);
        if (from !== undefined && date < from && (earlierDate === null || date > earlierDate)) earlierDate = date;
      };
      const names = new Map(summary.accounts.map(candidate => [candidate.id, candidate]));

      const records = this.records ? await this.records.recordsOf(input.userId, account.id) : [];
      records.forEach(record => noteEarlier(record.date));
      const recordOperations: AccountOperation[] = records.filter(record => inRange(record.date)).map(record => {
        const amountMinor = record.amountMinor ?? 0;
        const createdAt = record.createdAt ?? null;
        return {
          type: 'record',
          id: record.id!,
          date: record.date,
          createdAt,
          amountMinor: record.type === 'income' ? amountMinor : -amountMinor,
          countsInBalance: countsInBalance(account, { date: record.date, createdAt })
            && (record.currency ?? 'UZS') === account.currency,
          record,
        };
      });

      const moves = await this.moves.findByAccount(account.id);
      moves.forEach(move => noteEarlier(move.date));
      const moveOperations: AccountOperation[] = moves.filter(move => inRange(move.date)).map(move => {
        const otherId = move.fromAccountId === account.id ? move.toAccountId : move.fromAccountId;
        const other = otherId ? names.get(otherId) : undefined;
        const createdAt = move.createdAt.toISOString();
        return {
          type: 'move',
          id: move.id,
          date: move.date,
          createdAt,
          amountMinor: moveChangeFor(move, account.id),
          countsInBalance: countsInBalance(account, { date: move.date, createdAt }),
          kind: move.kind,
          counterpart: other ? { id: other.id, name: other.name, currency: other.currency } : null,
          move,
        };
      });

      const byDay = new Map<string, AccountOperation[]>();
      for (const operation of [...recordOperations, ...moveOperations]) {
        const date = dayOf(operation.date);
        const day = byDay.get(date) ?? [];
        day.push(operation);
        byDay.set(date, day);
      }
      const days = [...byDay.entries()]
        .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
        .map(([date, operations]) => ({
          date,
          operations: operations.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
        }));
      const hasOperations = await this.accounts.hasOperations(account.id);
      return ResultHelper.success({ account: { ...account, hasOperations }, days, earlierDate });
    } catch (error) {
      logger.error('Failed to read account operations', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to read account operations'));
    }
  }
}
