import type { Category } from './types';

/**
 * For tests: the 8 + 8 starter categories as `GET /api/categories` gives them to a new account (FT-099). The app
 * itself always reads the user's categories from the server — guest mode, which used this list, went away with
 * FT-128 (decision Д4).
 */
const STARTERS: Array<[Category['type'], string, string, Category['color']]> = [
  ['expense', 'groceries', 'Продукты', 'peach'],
  ['expense', 'cafe', 'Кафе', 'rose'],
  ['expense', 'transport', 'Транспорт', 'sky'],
  ['expense', 'home', 'Дом', 'sand'],
  ['expense', 'telecom', 'Связь', 'lilac'],
  ['expense', 'health', 'Здоровье', 'mint'],
  ['expense', 'shopping', 'Покупки', 'butter'],
  ['expense', 'other', 'Другое', 'mist'],
  ['income', 'salary', 'Зарплата', 'mint'],
  ['income', 'freelance', 'Фриланс', 'lilac'],
  ['income', 'interest', 'Проценты', 'peach'],
  ['income', 'gifts', 'Подарки', 'rose'],
  ['income', 'refund', 'Возврат', 'sand'],
  ['income', 'business', 'Бизнес', 'sky'],
  ['income', 'cashback', 'Кэшбэк', 'butter'],
  ['income', 'other-income', 'Другое', 'mist'],
];

export const STARTER_CATEGORIES: Category[] = STARTERS.map(([type, key, name, color], index) => {
  const isOther = name === 'Другое';
  return {
    id: `starter:${key}`,
    type,
    name,
    color,
    isHidden: false,
    isOther,
    sortOrder: isOther ? 1000 : (index % 8 + 1) * 10,
    presetKey: key,
  };
});
