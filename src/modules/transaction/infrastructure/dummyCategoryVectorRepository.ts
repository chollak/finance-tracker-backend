import { CategoryVectorRepository } from '../domain/categoryVectorRepository';

export class DummyCategoryVectorRepository implements CategoryVectorRepository {
  async recommendCategory(_: string): Promise<{ category: string; score: number }> {
    return { category: '', score: 0 };
  }
}

