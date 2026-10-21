import { ALL_CATEGORIES, getCategoryById } from '../../../shared/domain/entities/Category';
import { CategoryColor, CategoryType } from './category';

/**
 * The starter categories every user gets (8 + 8 from the design) and how the 26 + 7 static ids used
 * before FT-099 map onto them (decision Д5, table in docs/pastel/money-model.md). The old static list in
 * `shared/domain/entities/Category.ts` stays as a dictionary: its names and aliases tell which old
 * category a word or a stored value meant, and so which new one it belongs to.
 */
export interface CategoryPreset {
  key: string;
  type: CategoryType;
  name: string;
  color: CategoryColor;
  isOther: boolean;
  sortOrder: number;
  /** Old static ids that move into this category. */
  legacyIds: readonly string[];
}

const OTHER_SORT_ORDER = 1000;

export const CATEGORY_PRESETS: readonly CategoryPreset[] = [
  { key: 'groceries', type: 'expense', name: 'Продукты', color: 'peach', isOther: false, sortOrder: 10, legacyIds: ['groceries'] },
  { key: 'cafe', type: 'expense', name: 'Кафе', color: 'rose', isOther: false, sortOrder: 20, legacyIds: ['food', 'restaurants', 'coffee'] },
  { key: 'transport', type: 'expense', name: 'Транспорт', color: 'sky', isOther: false, sortOrder: 30, legacyIds: ['transport', 'taxi', 'public-transport', 'fuel'] },
  { key: 'home', type: 'expense', name: 'Дом', color: 'sand', isOther: false, sortOrder: 40, legacyIds: ['utilities', 'rent', 'bills'] },
  { key: 'telecom', type: 'expense', name: 'Связь', color: 'lilac', isOther: false, sortOrder: 50, legacyIds: ['internet', 'subscriptions'] },
  { key: 'health', type: 'expense', name: 'Здоровье', color: 'mint', isOther: false, sortOrder: 60, legacyIds: ['health', 'pharmacy', 'fitness', 'sports'] },
  { key: 'shopping', type: 'expense', name: 'Покупки', color: 'butter', isOther: false, sortOrder: 70, legacyIds: ['shopping', 'clothing', 'electronics', 'gifts-expense'] },
  { key: 'other', type: 'expense', name: 'Другое', color: 'mist', isOther: true, sortOrder: OTHER_SORT_ORDER, legacyIds: ['entertainment', 'hobbies', 'education', 'courses', 'other', 'transfer', 'debt'] },

  { key: 'salary', type: 'income', name: 'Зарплата', color: 'mint', isOther: false, sortOrder: 10, legacyIds: ['salary', 'bonus'] },
  { key: 'freelance', type: 'income', name: 'Фриланс', color: 'lilac', isOther: false, sortOrder: 20, legacyIds: ['freelance'] },
  { key: 'interest', type: 'income', name: 'Проценты', color: 'peach', isOther: false, sortOrder: 30, legacyIds: ['investment'] },
  { key: 'gifts', type: 'income', name: 'Подарки', color: 'rose', isOther: false, sortOrder: 40, legacyIds: ['gift'] },
  { key: 'refund', type: 'income', name: 'Возврат', color: 'sand', isOther: false, sortOrder: 50, legacyIds: ['refund'] },
  { key: 'business', type: 'income', name: 'Бизнес', color: 'sky', isOther: false, sortOrder: 60, legacyIds: [] },
  { key: 'cashback', type: 'income', name: 'Кэшбэк', color: 'butter', isOther: false, sortOrder: 70, legacyIds: [] },
  { key: 'other-income', type: 'income', name: 'Другое', color: 'mist', isOther: true, sortOrder: OTHER_SORT_ORDER, legacyIds: ['other-income', 'transfer', 'debt'] },
];

export function otherPreset(type: CategoryType): CategoryPreset {
  return CATEGORY_PRESETS.find(preset => preset.type === type && preset.isOther)!;
}

export function presetByKey(key: string, type: CategoryType): CategoryPreset | undefined {
  return CATEGORY_PRESETS.find(preset => preset.key === key && preset.type === type);
}

/**
 * The starter category an old value belongs to, for a record of `type`. The value may be an old id
 * («taxi»), an old Russian name («Такси», «Другое» — the old column default) or an old alias
 * («кофейня»). An old category of the other type (an expense in «Зарплата»), `transfer`, `debt` and
 * anything unrecognised land in «Другое» of the record's own type.
 */
export function presetForLegacyCategory(value: string | null | undefined, type: CategoryType): CategoryPreset {
  const text = (value ?? '').trim();
  if (!text) return otherPreset(type);

  const byKey = presetByKey(text, type);
  if (byKey) return byKey;

  // An alias can belong to several old categories («ресторан» — food and restaurants, «подарок» — an
  // expense and an income one), so the first one with a home among this type's presets wins.
  const word = text.toLocaleLowerCase('ru-RU');
  const candidates = ALL_CATEGORIES.filter(legacy =>
    legacy.id === text
    || legacy.name.toLocaleLowerCase('ru-RU') === word
    || legacy.aliases.some(alias => alias.toLocaleLowerCase('ru-RU') === word)
  );
  for (const legacy of candidates) {
    const preset = CATEGORY_PRESETS.find(p => p.type === type && p.legacyIds.includes(legacy.id));
    if (preset) return preset;
  }
  return otherPreset(type);
}

/**
 * Learned patterns are shared by all users, so they name categories by starter key. Older learning
 * files hold the static ids of before FT-099; this maps either to a key. Without a record type, an
 * old id goes to the expense starter that absorbed it, else the income one, else «Другое».
 */
export function presetKeyForLearning(value: string): string {
  if (CATEGORY_PRESETS.some(preset => preset.key === value)) return value;
  const expense = presetForLegacyCategory(value, 'expense');
  if (!expense.isOther) return expense.key;
  const income = presetForLegacyCategory(value, 'income');
  if (!income.isOther) return income.key;
  return expense.key;
}

/**
 * Every dictionary word of a starter category (FT-138): its default name and the ids, names and aliases of
 * the old categories it absorbed — the words `presetForLegacyCategory` resolves to it. Unlike `presetHints`
 * nothing is left out: such a word in a phrase means the dictionary gave the category, not the AI.
 */
export function presetSynonyms(preset: CategoryPreset): string[] {
  const words = new Set<string>([preset.name]);
  for (const legacyId of preset.legacyIds) {
    const legacy = getCategoryById(legacyId);
    if (!legacy) continue;
    for (const word of [legacy.id, legacy.name, ...legacy.aliases]) words.add(word);
  }
  return [...words];
}

/**
 * Words that point at a starter category: the names and aliases of the old categories it absorbed.
 * The starter's own default name stays among them — after a rename it is still a good hint.
 */
export function presetHints(preset: CategoryPreset, limit = 12): string[] {
  const perLegacy = preset.legacyIds
    .filter(legacyId => legacyId !== 'transfer' && legacyId !== 'debt')
    .map(legacyId => getCategoryById(legacyId))
    .filter((legacy): legacy is NonNullable<typeof legacy> => legacy !== undefined)
    .map(legacy => [legacy.name, ...legacy.aliases]
      .filter(word => /[а-яё]/i.test(word))
      .map(word => word.toLocaleLowerCase('ru-RU')));

  // Round robin over the old categories, so «Кафе» gets coffee words as well as food words
  const words = new Set<string>();
  for (let index = 0; perLegacy.some(list => index < list.length); index += 1) {
    for (const list of perLegacy) {
      if (index < list.length) words.add(list[index]);
    }
  }
  return [...words].slice(0, limit);
}
