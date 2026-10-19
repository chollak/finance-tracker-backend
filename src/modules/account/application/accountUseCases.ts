import { randomUUID } from 'crypto';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { BusinessLogicError, ConflictError, NotFoundError, ValidationError } from '../../../shared/domain/errors/AppError';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { isMinorInteger } from '../../../shared/domain/money/money';
import { isValidDateOnly, todayDateOnly } from '../../../shared/domain/dates/dateOnly';
import {
  ACCOUNT_KINDS,
  ACCOUNT_NAME_MAX_LENGTH,
  Account,
  CURRENCIES,
  accountNameKey,
  isAccountKind,
  isCurrency,
} from '../domain/account';
import { AccountRepository } from '../domain/accountRepository';
import { AccountBook, AccountsSummary } from './accountBook';

const logger = getLogger(LogCategory.TRANSACTION);

function checkName(value: unknown): Result<string, ValidationError> {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!name) return ResultHelper.failure(new ValidationError('name is required', 'name'));
  if (name.length > ACCOUNT_NAME_MAX_LENGTH) {
    return ResultHelper.failure(new ValidationError(`name must be at most ${ACCOUNT_NAME_MAX_LENGTH} characters`, 'name'));
  }
  return ResultHelper.success(name);
}

function nameTaken(accounts: Account[], name: string, exceptId?: string): Account | undefined {
  const key = accountNameKey(name);
  return accounts.find(account => account.id !== exceptId && accountNameKey(account.name) === key);
}

export class ListAccountsUseCase {
  constructor(private book: AccountBook) {}

  async execute(input: { userId: string }): Promise<Result<AccountsSummary>> {
    try {
      return ResultHelper.success(await this.book.summary(input.userId));
    } catch (error) {
      logger.error('Failed to list accounts', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to list accounts'));
    }
  }
}

export class CreateAccountUseCase {
  constructor(private book: AccountBook, private repository: AccountRepository) {}

  /**
   * A new account. «Сколько на нём сейчас» becomes its opening balance on the opening date (today by
   * default) — it is not income and does not appear in analytics.
   */
  async execute(input: { userId: string; body: Record<string, unknown> }): Promise<Result<Account>> {
    const { body } = input;
    const name = checkName(body.name);
    if (!name.success) return name;
    if (!isAccountKind(body.kind)) {
      return ResultHelper.failure(new ValidationError(`kind must be one of: ${ACCOUNT_KINDS.join(', ')}`, 'kind'));
    }
    if (!isCurrency(body.currency)) {
      return ResultHelper.failure(new ValidationError(`currency must be one of: ${CURRENCIES.join(', ')}`, 'currency'));
    }
    const openingBalanceMinor = body.openingBalanceMinor ?? 0;
    if (!isMinorInteger(openingBalanceMinor)) {
      return ResultHelper.failure(new ValidationError('openingBalanceMinor must be an integer number of minor units', 'openingBalanceMinor'));
    }
    const openingDate = body.openingDate ?? todayDateOnly();
    if (!isValidDateOnly(openingDate)) {
      return ResultHelper.failure(new ValidationError('openingDate must be a date YYYY-MM-DD', 'openingDate'));
    }

    try {
      const accounts = await this.book.listForUser(input.userId);
      const taken = nameTaken(accounts, name.data);
      if (taken) return ResultHelper.failure(new ConflictError(`Account «${taken.name}» already exists`));

      const sortOrder = Math.max(0, ...accounts.map(account => account.sortOrder)) + 10;
      const created = await this.repository.create({
        id: randomUUID(),
        userId: input.userId,
        name: name.data,
        kind: body.kind,
        currency: body.currency,
        openingBalanceMinor,
        openingDate,
        isHidden: false,
        sortOrder,
      });
      return ResultHelper.success(created);
    } catch (error) {
      logger.error('Failed to create account', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to create account'));
    }
  }
}

const EDITABLE = ['name', 'kind', 'currency', 'isHidden'];

export class UpdateAccountUseCase {
  constructor(private book: AccountBook, private repository: AccountRepository) {}

  /** Rename, switch cash/card, hide or show; change the currency only while the account has no operations. */
  async execute(input: { userId: string; accountId: string; body: Record<string, unknown> }): Promise<Result<Account>> {
    const fields = Object.keys(input.body);
    const unknown = fields.filter(field => !EDITABLE.includes(field));
    if (fields.length === 0 || unknown.length > 0) {
      return ResultHelper.failure(new ValidationError(
        unknown.length > 0 ? `${unknown.join(', ')} cannot be changed` : 'Send name, kind, currency or isHidden'
      ));
    }

    try {
      const accounts = await this.book.listForUser(input.userId);
      const account = accounts.find(item => item.id === input.accountId);
      if (!account) return ResultHelper.failure(new NotFoundError('Account', input.accountId));

      const changes: Partial<Pick<Account, 'name' | 'kind' | 'currency' | 'isHidden'>> = {};
      if (input.body.name !== undefined) {
        const name = checkName(input.body.name);
        if (!name.success) return name;
        const taken = nameTaken(accounts, name.data, account.id);
        if (taken) return ResultHelper.failure(new ConflictError(`Account «${taken.name}» already exists`));
        changes.name = name.data;
      }
      if (input.body.kind !== undefined) {
        if (!isAccountKind(input.body.kind)) {
          return ResultHelper.failure(new ValidationError(`kind must be one of: ${ACCOUNT_KINDS.join(', ')}`, 'kind'));
        }
        changes.kind = input.body.kind;
      }
      if (input.body.currency !== undefined) {
        if (!isCurrency(input.body.currency)) {
          return ResultHelper.failure(new ValidationError(`currency must be one of: ${CURRENCIES.join(', ')}`, 'currency'));
        }
        if (input.body.currency !== account.currency && (await this.repository.hasOperations(account.id))) {
          return ResultHelper.failure(new ConflictError('The currency of an account with operations cannot change'));
        }
        changes.currency = input.body.currency;
      }
      if (input.body.isHidden !== undefined) {
        if (typeof input.body.isHidden !== 'boolean') {
          return ResultHelper.failure(new ValidationError('isHidden must be true or false', 'isHidden'));
        }
        const othersVisible = accounts.some(item => item.id !== account.id && !item.isHidden);
        if (input.body.isHidden && !othersVisible) {
          return ResultHelper.failure(new ValidationError('The last visible account cannot be hidden', 'isHidden'));
        }
        changes.isHidden = input.body.isHidden;
      }

      return ResultHelper.success(await this.repository.update(account.id, changes));
    } catch (error) {
      logger.error('Failed to update account', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to update account'));
    }
  }
}
