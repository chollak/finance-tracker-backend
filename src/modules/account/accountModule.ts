import { AccountRepository } from './domain/accountRepository';
import { AccountBook, DefaultAccountSource } from './application/accountBook';
import { CreateAccountUseCase, ListAccountsUseCase, UpdateAccountUseCase } from './application/accountUseCases';
import { RepositoryFactory } from '../../shared/infrastructure/database/repositoryFactory';

/**
 * Accounts (FT-101): balances computed on read, the total in сум, the account of every new record.
 * The book is the account resolver of the transaction module.
 */
export class AccountModule {
  private book: AccountBook;

  constructor(private repository: AccountRepository, defaultAccount?: DefaultAccountSource) {
    this.book = new AccountBook(repository, defaultAccount);
  }

  static create(): AccountModule {
    return new AccountModule(RepositoryFactory.createAccountRepository());
  }

  getBook(): AccountBook {
    return this.book;
  }

  getRepository(): AccountRepository {
    return this.repository;
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
}
