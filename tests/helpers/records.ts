import { DataSource } from 'typeorm';
import { SqliteTransactionRepository } from '../../src/modules/transaction/infrastructure/persistence/SqliteTransactionRepository';
import { CreateTransactionUseCase } from '../../src/modules/transaction/application/createTransaction';
import { UpdateTransactionUseCase } from '../../src/modules/transaction/application/updateTransaction';
import { CategoryCatalog } from '../../src/modules/category/application/categoryCatalog';
import { SqliteCategoryRepository } from '../../src/modules/category/infrastructure/SqliteCategoryRepository';
import { AccountBook } from '../../src/modules/account/application/accountBook';
import { SqliteAccountRepository } from '../../src/modules/account/infrastructure/SqliteAccountRepository';
import { SqliteAccountMoveRepository } from '../../src/modules/account/infrastructure/SqliteAccountMoveRepository';

/** Records wired the way createModules() wires them, on a test data source. */
export function recordsOn(dataSource: DataSource) {
  const repository = new SqliteTransactionRepository(dataSource);
  const catalog = new CategoryCatalog(new SqliteCategoryRepository(dataSource));
  const accountRepository = new SqliteAccountRepository(dataSource);
  const book = new AccountBook(accountRepository);
  return {
    repository,
    catalog,
    book,
    accountRepository,
    moveRepository: new SqliteAccountMoveRepository(dataSource),
    create: new CreateTransactionUseCase(repository, catalog, book),
    update: new UpdateTransactionUseCase(repository, catalog, book),
    /** Marks a record as the archive left it before #273: nothing in the app archives one any more (decision Д7). */
    markArchived: async (id: string): Promise<void> => {
      await dataSource.query('UPDATE transactions SET isArchived = 1 WHERE id = ?', [id]);
    },
  };
}
