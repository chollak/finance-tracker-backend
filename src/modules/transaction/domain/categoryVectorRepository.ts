export interface CategoryVectorRepository {
  recommendCategory(text: string): Promise<{ category: string; score: number }>;
}

