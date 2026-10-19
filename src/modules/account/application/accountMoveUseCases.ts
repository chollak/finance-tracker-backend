import { randomUUID } from 'crypto';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { BusinessLogicError, NotFoundError, ValidationError } from '../../../shared/domain/errors/AppError';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { MAX_ABS_AMOUNT_MINOR, isMinorInteger } from '../../../shared/domain/money/money';
import { isValidDateOnly, todayDateOnly } from '../../../shared/domain/dates/dateOnly';
import { Account } from '../domain/account';
import { AccountMove, MOVE_KINDS, MOVE_NOTE_MAX_LENGTH, dealRateMinor, isMoveKind } from '../domain/accountMove';
import { AccountMoveRepository } from '../domain/accountMoveRepository';
import { CbuRateOnDate } from '../domain/fxRate';
import { AccountBook } from './accountBook';

const logger = getLogger(LogCategory.TRANSACTION);

type Body = Record<string, unknown>;
const fail = (message: string, field?: string) => ResultHelper.failure(new ValidationError(message, field));

function positiveAmount(value: unknown, field: string): Result<number, ValidationError> {
  if (!isMinorInteger(value) || value < 1 || value > MAX_ABS_AMOUNT_MINOR) {
    return fail(`${field} must be a positive integer number of minor units`, field);
  }
  return ResultHelper.success(value);
}

function noteOf(value: unknown): Result<string | null, ValidationError> {
  if (value === undefined || value === null) return ResultHelper.success(null);
  if (typeof value !== 'string') return fail('note must be a string', 'note');
  const note = value.trim();
  if (note.length > MOVE_NOTE_MAX_LENGTH) return fail(`note must be at most ${MOVE_NOTE_MAX_LENGTH} characters`, 'note');
  return ResultHelper.success(note || null);
}

/**
 * Records a transfer, an exchange or an adjustment (FT-104).
 *
 * - transfer: `fromAccountId`, `toAccountId` in one currency, `amountMinor`;
 * - exchange: accounts in different currencies, `fromAmountMinor` given and `toAmountMinor` received;
 *   the deal rate follows from them, the Central Bank rate on the date is kept for comparison;
 * - adjustment: `accountId` and `balanceMinor` — what is really on the account; the difference with the
 *   computed balance is recorded, dated today.
 *
 * Accounts must be the user's and visible. A date before an account's opening date is refused: such a
 * move would count on one account and not the other.
 */
export class CreateMoveUseCase {
  constructor(
    private book: AccountBook,
    private moves: AccountMoveRepository,
    private rates?: CbuRateOnDate
  ) {}

  setRates(rates: CbuRateOnDate): void {
    this.rates = rates;
  }

  async execute(input: { userId: string; body: Body }): Promise<Result<AccountMove>> {
    try {
      const { body, userId } = input;
      if (!isMoveKind(body.kind)) return fail(`kind must be one of: ${MOVE_KINDS.join(', ')}`, 'kind');
      const note = noteOf(body.note);
      if (!note.success) return note;

      const accounts = await this.book.listForUser(userId);
      const visible = accounts.filter(account => !account.isHidden);
      const pick = (value: unknown, field: string): Result<Account> => {
        const account = typeof value === 'string' ? accounts.find(candidate => candidate.id === value) : undefined;
        if (!account) return ResultHelper.failure(new NotFoundError('Account', typeof value === 'string' ? value : undefined));
        if (account.isHidden) return fail(`Account «${account.name}» is hidden`, field);
        return ResultHelper.success(account);
      };

      if (body.kind === 'adjustment') return this.adjust(userId, body, pick, note.data);

      if (visible.length < 2) {
        return fail('A transfer needs a second visible account: add one first', 'toAccountId');
      }
      const from = pick(body.fromAccountId, 'fromAccountId');
      if (!from.success) return from;
      const to = pick(body.toAccountId, 'toAccountId');
      if (!to.success) return to;
      if (from.data.id === to.data.id) return fail('fromAccountId and toAccountId must differ', 'toAccountId');

      const date = body.date ?? todayDateOnly();
      if (!isValidDateOnly(date)) return fail('date must be a date YYYY-MM-DD', 'date');
      for (const account of [from.data, to.data]) {
        if (date < account.openingDate) {
          return fail(`date is before the opening date of «${account.name}» (${account.openingDate})`, 'date');
        }
      }

      const base = { id: randomUUID(), userId, fromAccountId: from.data.id, toAccountId: to.data.id, date, note: note.data };
      const sameCurrency = from.data.currency === to.data.currency;

      if (body.kind === 'transfer') {
        if (!sameCurrency) return fail('The accounts are in different currencies: that is an exchange', 'toAccountId');
        const amount = positiveAmount(body.amountMinor, 'amountMinor');
        if (!amount.success) return amount;
        return ResultHelper.success(await this.moves.create({
          ...base, kind: 'transfer', fromAmountMinor: amount.data, toAmountMinor: amount.data,
          dealRateMinor: null, cbuRateMinor: null, createdAt: new Date(), deletedAt: null,
        }));
      }

      if (sameCurrency) return fail('The accounts are in one currency: that is a transfer', 'toAccountId');
      const given = positiveAmount(body.fromAmountMinor, 'fromAmountMinor');
      if (!given.success) return given;
      const received = positiveAmount(body.toAmountMinor, 'toAmountMinor');
      if (!received.success) return received;
      return ResultHelper.success(await this.moves.create({
        ...base,
        kind: 'exchange',
        fromAmountMinor: given.data,
        toAmountMinor: received.data,
        dealRateMinor: dealRateMinor(
          { currency: from.data.currency, amountMinor: given.data },
          { currency: to.data.currency, amountMinor: received.data }
        ),
        cbuRateMinor: await this.cbuRateOn(date),
        createdAt: new Date(),
        deletedAt: null,
      }));
    } catch (error) {
      logger.error('Failed to record a move', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to record a move'));
    }
  }

  private async adjust(
    userId: string,
    body: Body,
    pick: (value: unknown, field: string) => Result<Account>,
    note: string | null
  ): Promise<Result<AccountMove>> {
    const account = pick(body.accountId, 'accountId');
    if (!account.success) return account;
    if (!isMinorInteger(body.balanceMinor) || Math.abs(body.balanceMinor) > MAX_ABS_AMOUNT_MINOR) {
      return fail('balanceMinor must be an integer number of minor units', 'balanceMinor');
    }
    const summary = await this.book.summary(userId);
    const current = summary.accounts.find(candidate => candidate.id === account.data.id)!.balanceMinor;
    const difference = body.balanceMinor - current;
    if (difference === 0) return fail('The balance already matches', 'balanceMinor');

    const today = todayDateOnly();
    return ResultHelper.success(await this.moves.create({
      id: randomUUID(),
      userId,
      kind: 'adjustment',
      fromAccountId: null,
      toAccountId: account.data.id,
      fromAmountMinor: null,
      toAmountMinor: difference,
      dealRateMinor: null,
      cbuRateMinor: null,
      // An account opened later than today (by hand) is adjusted on its opening date, so the
      // difference counts
      date: today < account.data.openingDate ? account.data.openingDate : today,
      note,
      createdAt: new Date(),
      deletedAt: null,
    }));
  }

  private async cbuRateOn(date: string): Promise<number | null> {
    if (!this.rates) return null;
    try {
      return (await this.rates.cbuRateOn(date))?.rateMinor ?? null;
    } catch (error) {
      logger.warn('No CBU rate for an exchange', { date, error: (error as Error).message });
      return null;
    }
  }
}

/** Deletes a move softly or brings it back (FT-104); both balances follow. Repeating either is harmless. */
export class SetMoveDeletedUseCase {
  constructor(private moves: AccountMoveRepository) {}

  async execute(input: { userId: string; moveId: string; deleted: boolean }): Promise<Result<AccountMove>> {
    try {
      const move = await this.moves.findById(input.moveId);
      if (!move || move.userId !== input.userId) return ResultHelper.failure(new NotFoundError('Move', input.moveId));
      if ((move.deletedAt !== null) === input.deleted) return ResultHelper.success(move);
      return ResultHelper.success(await this.moves.setDeletedAt(move.id, input.deleted ? new Date() : null));
    } catch (error) {
      logger.error('Failed to delete or restore a move', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to delete or restore a move'));
    }
  }
}
