import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { BusinessLogicError, ConflictError, ValidationError } from '../../../shared/domain/errors/AppError';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { isMinorInteger } from '../../../shared/domain/money/money';
import { todayDateOnly } from '../../../shared/domain/dates/dateOnly';
import { Account, accountNameKey } from '../domain/account';
import { AccountRepository } from '../domain/accountRepository';
import {
  FIRST_LAUNCH_ACCOUNTS,
  FirstLaunchAccount,
  FirstLaunchProgress,
  firstLaunchAccountId,
  firstLaunchSortOrder,
} from '../domain/firstLaunch';
import { AccountBook, AccountsSummary } from './accountBook';

const logger = getLogger(LogCategory.TRANSACTION);

export interface CompleteFirstLaunchInput {
  userId: string;
  /** `{ cashMinor?, cardMinor?, usdMinor? }` — what is on each account now; a missing one is 0. */
  body: unknown;
}

export interface FirstLaunchResult extends AccountsSummary {
  onboardedAt: string;
}

type OpeningAmounts = Record<FirstLaunchAccount['field'], number>;

const FIELDS = FIRST_LAUNCH_ACCOUNTS.map(account => account.field);

function readAmounts(body: unknown): Result<OpeningAmounts, ValidationError> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return ResultHelper.failure(new ValidationError('Send an object { cashMinor, cardMinor, usdMinor }'));
  }
  const values = body as Record<string, unknown>;
  const unknown = Object.keys(values).filter(field => !(FIELDS as string[]).includes(field));
  if (unknown.length > 0) {
    return ResultHelper.failure(new ValidationError(`${unknown.join(', ')} is not an opening balance`));
  }

  const amounts = { cashMinor: 0, cardMinor: 0, usdMinor: 0 };
  for (const field of FIELDS) {
    const value = values[field] ?? 0;
    if (!isMinorInteger(value) || value < 0) {
      return ResultHelper.failure(new ValidationError(`${field} must be a whole number of minor units, 0 or more`, field));
    }
    amounts[field] = value;
  }
  return ResultHelper.success(amounts);
}

/**
 * The account a row of the first-launch screen sets: a visible account in the row's currency with the
 * row's name, else one of the row's kind (a migrated user's «Карта»), else none — then it is created.
 */
function existingAccountFor(row: FirstLaunchAccount, accounts: Account[], taken: Set<string>): Account | undefined {
  const candidates = accounts.filter(account => !account.isHidden && account.currency === row.currency && !taken.has(account.id));
  return candidates.find(account => accountNameKey(account.name) === accountNameKey(row.name))
    ?? candidates.find(account => account.kind === row.kind);
}

/**
 * POST /api/accounts/opening-balances (FT-109): «Сколько у вас сейчас денег?». Cash, card and dollars
 * become the opening balances of «Наличные», «Карта» and «Доллары», dated today and kept with this moment:
 * records and moves before today, and those of today written before now (the bot, the Shortcut — FT-163), no
 * longer count in the balance (money-model «Остаток счёта») but stay in history and analytics.
 * The three stand first, in the order of the screen and the boards: Наличные, Карта, Доллары (FT-137) — a
 * migrated or new user's «Карта» was created first and would otherwise lead; any other account follows them
 * in its own order. Then the first launch is marked done. It happens once; later corrections go through
 * the accounts screen (FT-118).
 */
export class CompleteFirstLaunchUseCase {
  constructor(
    private book: AccountBook,
    private repository: AccountRepository,
    private progress: FirstLaunchProgress,
    private now: () => Date = () => new Date()
  ) {}

  async execute(input: CompleteFirstLaunchInput): Promise<Result<FirstLaunchResult>> {
    const amounts = readAmounts(input.body);
    if (!amounts.success) return amounts;

    try {
      if (await this.progress.onboardedAt(input.userId)) {
        return ResultHelper.failure(new ConflictError('The first launch is already done: change balances on the accounts screen'));
      }

      const moment = this.now();
      const openingDate = todayDateOnly(moment);
      const openingAt = moment.toISOString();
      const accounts = await this.book.listForUser(input.userId);
      const used = new Set<string>();

      for (const [position, row] of FIRST_LAUNCH_ACCOUNTS.entries()) {
        const opening = {
          openingBalanceMinor: amounts.data[row.field], openingDate, openingAt, sortOrder: firstLaunchSortOrder(position),
        };
        const existing = existingAccountFor(row, accounts, used);
        if (existing) {
          used.add(existing.id);
          await this.repository.update(existing.id, opening);
          continue;
        }

        const id = firstLaunchAccountId(input.userId, row.slot);
        try {
          await this.repository.create({
            id, userId: input.userId, name: row.name, kind: row.kind, currency: row.currency,
            ...opening, isHidden: false,
          });
        } catch (error) {
          // A concurrent first launch created it a moment ago: set the same opening balance on it
          if (!(await this.repository.findById(id))) throw error;
          await this.repository.update(id, opening);
        }
        used.add(id);
      }

      // Accounts the screen did not set follow the three, in the order they had
      const others = accounts.filter(account => !used.has(account.id));
      for (const [index, account] of others.entries()) {
        const sortOrder = firstLaunchSortOrder(FIRST_LAUNCH_ACCOUNTS.length + index);
        if (account.sortOrder !== sortOrder) await this.repository.update(account.id, { sortOrder });
      }

      await this.progress.markOnboarded(input.userId, openingAt);
      logger.info('First launch completed', { userId: input.userId, openingDate });
      return ResultHelper.success({ ...(await this.book.summary(input.userId)), onboardedAt: openingAt });
    } catch (error) {
      logger.error('Failed to complete the first launch', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to save opening balances'));
    }
  }
}
