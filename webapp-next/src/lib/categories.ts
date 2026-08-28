/**
 * Справочник категорий. Копия src/shared/domain/entities/Category.ts без aliases —
 * ровно так же, как это было в старом фронте, и по той же причине: aliases нужны
 * парсеру на сервере, интерфейсу от них пользы нет.
 *
 * ВАЖНО: при изменении категорий на бэкенде обновить и здесь. Это единственное
 * место дублирования, оставленное сознательно — тянуть справочник по сети ради
 * двух десятков неизменных строк дороже, чем держать копию.
 *
 * Иконки монохромные и сгруппированы: 35 категорий делят 21 глиф. Эмодзи
 * из Category.icon не используются — цветные картинки в монохромной композиции
 * дают тот самый визуальный шум, от которого продукт уходит.
 */

export type GlyphName =
  | 'bag'
  | 'basket'
  | 'book'
  | 'bulb'
  | 'bus'
  | 'car'
  | 'coffee'
  | 'debt'
  | 'device'
  | 'doc'
  | 'dot'
  | 'food'
  | 'fuel'
  | 'gift'
  | 'health'
  | 'home'
  | 'money'
  | 'play'
  | 'sport'
  | 'transfer'
  | 'wifi';

export interface CategoryInfo {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'both';
  glyph: GlyphName;
}

export const CATEGORIES: CategoryInfo[] = [
  { id: 'food', name: 'Еда', type: 'expense', glyph: 'food' },
  { id: 'groceries', name: 'Продукты', type: 'expense', glyph: 'basket' },
  { id: 'restaurants', name: 'Рестораны', type: 'expense', glyph: 'food' },
  { id: 'coffee', name: 'Кофе', type: 'expense', glyph: 'coffee' },
  { id: 'transport', name: 'Транспорт', type: 'expense', glyph: 'car' },
  { id: 'taxi', name: 'Такси', type: 'expense', glyph: 'car' },
  { id: 'public-transport', name: 'Общ. транспорт', type: 'expense', glyph: 'bus' },
  { id: 'fuel', name: 'Топливо', type: 'expense', glyph: 'fuel' },
  { id: 'utilities', name: 'Коммунальные', type: 'expense', glyph: 'bulb' },
  { id: 'rent', name: 'Аренда', type: 'expense', glyph: 'home' },
  { id: 'internet', name: 'Интернет', type: 'expense', glyph: 'wifi' },
  { id: 'shopping', name: 'Покупки', type: 'expense', glyph: 'bag' },
  { id: 'clothing', name: 'Одежда', type: 'expense', glyph: 'bag' },
  { id: 'electronics', name: 'Электроника', type: 'expense', glyph: 'device' },
  { id: 'entertainment', name: 'Развлечения', type: 'expense', glyph: 'play' },
  { id: 'hobbies', name: 'Хобби', type: 'expense', glyph: 'play' },
  { id: 'sports', name: 'Спорт', type: 'expense', glyph: 'sport' },
  { id: 'health', name: 'Здоровье', type: 'expense', glyph: 'health' },
  { id: 'pharmacy', name: 'Аптека', type: 'expense', glyph: 'health' },
  { id: 'fitness', name: 'Фитнес', type: 'expense', glyph: 'sport' },
  { id: 'education', name: 'Образование', type: 'expense', glyph: 'book' },
  { id: 'courses', name: 'Курсы', type: 'expense', glyph: 'book' },
  { id: 'bills', name: 'Счета', type: 'expense', glyph: 'doc' },
  { id: 'subscriptions', name: 'Подписки', type: 'expense', glyph: 'doc' },
  { id: 'gifts-expense', name: 'Подарки', type: 'expense', glyph: 'gift' },
  { id: 'other', name: 'Другое', type: 'expense', glyph: 'dot' },
  { id: 'salary', name: 'Зарплата', type: 'income', glyph: 'money' },
  { id: 'freelance', name: 'Фриланс', type: 'income', glyph: 'money' },
  { id: 'investment', name: 'Инвестиции', type: 'income', glyph: 'money' },
  { id: 'gift', name: 'Подарок', type: 'income', glyph: 'gift' },
  { id: 'refund', name: 'Возврат', type: 'income', glyph: 'money' },
  { id: 'bonus', name: 'Бонус', type: 'income', glyph: 'money' },
  { id: 'other-income', name: 'Другое', type: 'income', glyph: 'money' },
  { id: 'transfer', name: 'Перевод', type: 'both', glyph: 'transfer' },
  { id: 'debt', name: 'Долг', type: 'both', glyph: 'debt' },
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

/** Незнакомый идентификатор не должен ломать экран: показываем как есть. */
export function categoryName(id: string): string {
  return BY_ID.get(id)?.name ?? id;
}

export function categoryGlyph(id: string): GlyphName {
  return BY_ID.get(id)?.glyph ?? 'dot';
}

export const EXPENSE_CATEGORIES = CATEGORIES.filter(
  (c) => c.type === 'expense' || c.type === 'both'
);
