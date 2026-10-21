import { describe, expect, it } from 'vitest';
import { STARTER_CATEGORIES } from '../model/fixtures';
import { findCategory, pickableCategories } from './categoryList';

describe('category list (FT-100)', () => {
  it('offers the visible categories of one type, «Другое» last', () => {
    const categories = STARTER_CATEGORIES.map((category) =>
      category.name === 'Связь' ? { ...category, isHidden: true } : category
    );

    const expense = pickableCategories(categories, 'expense').map((category) => category.name);
    expect(expense).toEqual(['Продукты', 'Кафе', 'Транспорт', 'Дом', 'Здоровье', 'Покупки', 'Другое']);
    expect(pickableCategories(categories, 'income')[0].name).toBe('Зарплата');
    expect(pickableCategories(undefined, 'income')).toEqual([]);
  });

  it('finds a category by id', () => {
    expect(findCategory(STARTER_CATEGORIES, 'starter:cafe')?.name).toBe('Кафе');
    expect(findCategory(STARTER_CATEGORIES, 'missing')).toBeUndefined();
    expect(findCategory(STARTER_CATEGORIES, undefined)).toBeUndefined();
  });

  it('mirrors the 8 + 8 starter categories of a server account', () => {
    expect(STARTER_CATEGORIES.filter((c) => c.type === 'expense')).toHaveLength(8);
    expect(STARTER_CATEGORIES.filter((c) => c.type === 'income')).toHaveLength(8);
    expect(STARTER_CATEGORIES.filter((c) => c.isOther).map((c) => c.type)).toEqual(['expense', 'income']);
  });
});
