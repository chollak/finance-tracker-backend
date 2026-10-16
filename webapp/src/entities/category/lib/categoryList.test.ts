import { describe, expect, it } from 'vitest';
import { GUEST_CATEGORIES } from '../model/guestCategories';
import { findCategory, pickableCategories } from './categoryList';

describe('category list (FT-100)', () => {
  it('offers the visible categories of one type, «Другое» last', () => {
    const categories = GUEST_CATEGORIES.map((category) =>
      category.name === 'Связь' ? { ...category, isHidden: true } : category
    );

    const expense = pickableCategories(categories, 'expense').map((category) => category.name);
    expect(expense).toEqual(['Продукты', 'Кафе', 'Транспорт', 'Дом', 'Здоровье', 'Покупки', 'Другое']);
    expect(pickableCategories(categories, 'income')[0].name).toBe('Зарплата');
    expect(pickableCategories(undefined, 'income')).toEqual([]);
  });

  it('finds a category by id', () => {
    expect(findCategory(GUEST_CATEGORIES, 'guest:cafe')?.name).toBe('Кафе');
    expect(findCategory(GUEST_CATEGORIES, 'missing')).toBeUndefined();
    expect(findCategory(GUEST_CATEGORIES, undefined)).toBeUndefined();
  });

  it('mirrors the 8 + 8 starter categories of a server account', () => {
    expect(GUEST_CATEGORIES.filter((c) => c.type === 'expense')).toHaveLength(8);
    expect(GUEST_CATEGORIES.filter((c) => c.type === 'income')).toHaveLength(8);
    expect(GUEST_CATEGORIES.filter((c) => c.isOther).map((c) => c.type)).toEqual(['expense', 'income']);
  });
});
