import { DataSource, Repository } from 'typeorm';
import { AppDataSource } from '../../../shared/infrastructure/database/database.config';
import { Category as CategoryEntity } from '../../../shared/infrastructure/database/entities/Category';
import { Category, CategoryColor, CategoryType, categoryNameKey, isCategoryColor } from '../domain/category';
import { CategoryRepository } from '../domain/categoryRepository';

export class SqliteCategoryRepository implements CategoryRepository {
  private repository: Repository<CategoryEntity>;

  constructor(dataSource: DataSource = AppDataSource) {
    this.repository = dataSource.getRepository(CategoryEntity);
  }

  async findByUserId(userId: string): Promise<Category[]> {
    const entities = await this.repository.find({
      where: { userId },
      order: { type: 'ASC', sortOrder: 'ASC', name: 'ASC' },
    });
    return entities.map(entity => this.toDomain(entity));
  }

  async findById(id: string): Promise<Category | null> {
    const entity = await this.repository.findOne({ where: { id } });
    return entity ? this.toDomain(entity) : null;
  }

  async createManyIgnoringDuplicates(categories: Category[]): Promise<void> {
    if (categories.length === 0) return;
    await this.repository
      .createQueryBuilder()
      .insert()
      .values(categories.map(category => this.toEntity(category)))
      .orIgnore()
      .execute();
  }

  async create(category: Category): Promise<Category> {
    const saved = await this.repository.save(this.repository.create(this.toEntity(category)));
    return this.toDomain(saved);
  }

  async update(id: string, changes: Partial<Pick<Category, 'name' | 'color' | 'isHidden' | 'sortOrder'>>): Promise<Category> {
    const data: Partial<CategoryEntity> = {};
    if (changes.name !== undefined) {
      data.name = changes.name;
      data.nameKey = categoryNameKey(changes.name);
    }
    if (changes.color !== undefined) data.color = changes.color;
    if (changes.isHidden !== undefined) data.isHidden = changes.isHidden;
    if (changes.sortOrder !== undefined) data.sortOrder = changes.sortOrder;
    if (Object.keys(data).length > 0) await this.repository.update(id, data);

    const updated = await this.findById(id);
    if (!updated) throw new Error(`Category ${id} not found after update`);
    return updated;
  }

  async maxSortOrder(userId: string, type: CategoryType): Promise<number> {
    const row = await this.repository
      .createQueryBuilder('category')
      .select('MAX(category.sortOrder)', 'max')
      .where('category.userId = :userId', { userId })
      .andWhere('category.type = :type', { type })
      .andWhere('category.isOther = :isOther', { isOther: false })
      .getRawOne<{ max: number | null }>();
    return Number(row?.max ?? 0);
  }

  private toEntity(category: Category): Partial<CategoryEntity> {
    return {
      id: category.id,
      userId: category.userId,
      type: category.type,
      name: category.name,
      nameKey: categoryNameKey(category.name),
      color: category.color,
      isHidden: category.isHidden,
      isOther: category.isOther,
      sortOrder: category.sortOrder,
      presetKey: category.presetKey,
    };
  }

  private toDomain(entity: CategoryEntity): Category {
    const color: CategoryColor = isCategoryColor(entity.color) ? entity.color : 'mist';
    return {
      id: entity.id,
      userId: entity.userId,
      type: entity.type === 'income' ? 'income' : 'expense',
      name: entity.name,
      color,
      isHidden: Boolean(entity.isHidden),
      isOther: Boolean(entity.isOther),
      sortOrder: Number(entity.sortOrder),
      presetKey: entity.presetKey ?? null,
    };
  }
}
