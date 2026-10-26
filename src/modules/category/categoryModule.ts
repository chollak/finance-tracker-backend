import { CategoryRepository } from './domain/categoryRepository';
import { CategoryCatalog } from './application/categoryCatalog';
import { CreateCategoryUseCase, DeleteCategoryUseCase, ListCategoriesUseCase, UpdateCategoryUseCase } from './application/categoryUseCases';
import { RepositoryFactory } from '../../shared/infrastructure/database/repositoryFactory';

/**
 * User categories (FT-099): 8 + 8 starter categories per user, renamed, recoloured and hidden by the
 * user; their own ones added and, right after, taken back (FT-127). The catalog is also the category
 * resolver of the transaction module and the source of the category list in AI prompts.
 */
export class CategoryModule {
  private catalog: CategoryCatalog;

  constructor(private repository: CategoryRepository) {
    this.catalog = new CategoryCatalog(repository);
  }

  static create(): CategoryModule {
    return new CategoryModule(RepositoryFactory.createCategoryRepository());
  }

  getCatalog(): CategoryCatalog {
    return this.catalog;
  }

  getListCategoriesUseCase(): ListCategoriesUseCase {
    return new ListCategoriesUseCase(this.catalog);
  }

  getCreateCategoryUseCase(): CreateCategoryUseCase {
    return new CreateCategoryUseCase(this.catalog, this.repository);
  }

  getUpdateCategoryUseCase(): UpdateCategoryUseCase {
    return new UpdateCategoryUseCase(this.catalog, this.repository);
  }

  getDeleteCategoryUseCase(): DeleteCategoryUseCase {
    return new DeleteCategoryUseCase(this.catalog, this.repository);
  }
}
