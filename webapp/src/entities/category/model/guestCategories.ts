import type { Category } from './types';

/**
 * Categories for guest mode, which has no server account. They mirror the 8 + 8 starter categories a
 * server account gets. Guest mode goes away with FT-128 (decision Д4), and this list with it.
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

export const GUEST_CATEGORIES: Category[] = STARTERS.map(([type, key, name, color], index) => {
  const isOther = name === 'Другое';
  return {
    id: `guest:${key}`,
    type,
    name,
    color,
    isHidden: false,
    isOther,
    sortOrder: isOther ? 1000 : (index % 8 + 1) * 10,
    presetKey: key,
  };
});
