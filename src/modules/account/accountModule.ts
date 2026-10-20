import { AccountRepository } from './domain/accountRepository';
import { AccountMove } from './domain/accountMove';
import { AccountMoveRepository } from './domain/accountMoveRepository';
import { AccountRecordSource } from './domain/accountRecords';
import { CbuRateOnDate } from './domain/fxRate';
import { AccountBook, DefaultAccountSource } from './application/accountBook';
import { CreateAccountUseCase, DeleteAccountUseCase, ListAccountsUseCase, UpdateAccountUseCase } from './application/accountUseCases';
import { CreateMoveUseCase, SetMoveDeletedUseCase } from './application/accountMoveUseCases';
import { GetAccountOperationsUseCase } from './application/accountOperations';
import { CompleteFirstLaunchUseCase } from './application/firstLaunchUseCase';
import { FirstLaunchProgress } from './domain/firstLaunch';
import { RepositoryFactory } from '../../shared/infrastructure/database/repositoryFactory';

/**
 * Accounts (FT-101): balances computed on read, the total in сум, the account of every new record.
 * The book is the account resolver of the transaction module. Moves between accounts (FT-104):
 * transfers, exchanges, adjustments, and the operations of one account. The first launch (FT-109) sets
 * the opening balances.
 */
export class AccountModule {
  private book: AccountBook;
  private createMove: CreateMoveUseCase;
  private operations: GetAccountOperationsUseCase;

  constructor(
    private repository: AccountRepository,
    defaultAccount?: DefaultAccountSource,
    private moveRepository: AccountMoveRepository = RepositoryFactory.createAccountMoveRepository()
  ) {
    this.book = new AccountBook(repository, defaultAccount);
    this.createMove = new CreateMoveUseCase(this.book, moveRepository);
    this.operations = new GetAccountOperationsUseCase(this.book, moveRepository, repository);
  }

  static create(): AccountModule {
    return new AccountModule(RepositoryFactory.createAccountRepository());
  }

  /** Wired in createModules(): the CBU rate on a date for exchanges, the records of an account. */
  setCbuRates(rates: CbuRateOnDate): void {
    this.createMove.setRates(rates);
  }

  setRecordSource(records: AccountRecordSource): void {
    this.operations.setRecordSource(records);
  }

  getBook(): AccountBook {
    return this.book;
  }

  getRepository(): AccountRepository {
    return this.repository;
  }

  /** The user's moves that are not deleted, oldest first (FT-126: the export of all records). */
  movesOfUser(userId: string): Promise<AccountMove[]> {
    return this.moveRepository.findByUserId(userId);
  }

  getListAccountsUseCase(): ListAccountsUseCase {
    return new ListAccountsUseCase(this.book);
  }

  getCreateAccountUseCase(): CreateAccountUseCase {
    return new CreateAccountUseCase(this.book, this.repository);
  }

  getUpdateAccountUseCase(): UpdateAccountUseCase {
    return new UpdateAccountUseCase(this.book, this.repository);
  }

  getDeleteAccountUseCase(): DeleteAccountUseCase {
    return new DeleteAccountUseCase(this.book, this.repository);
  }

  getCreateMoveUseCase(): CreateMoveUseCase {
    return this.createMove;
  }

  getSetMoveDeletedUseCase(): SetMoveDeletedUseCase {
    return new SetMoveDeletedUseCase(this.moveRepository);
  }

  getAccountOperationsUseCase(): GetAccountOperationsUseCase {
    return this.operations;
  }

  /** First launch (FT-109): opening balances dated today; whether it is done lives in the user's settings. */
  getCompleteFirstLaunchUseCase(progress: FirstLaunchProgress): CompleteFirstLaunchUseCase {
    return new CompleteFirstLaunchUseCase(this.book, this.repository, progress);
  }
}
