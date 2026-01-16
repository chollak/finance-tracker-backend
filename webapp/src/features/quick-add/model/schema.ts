import { z } from 'zod';

/**
 * Quick Add schema - simplified for fast entry
 * Description is optional in quick mode
 */
export const quickAddSchema = z.object({
  amount: z
    .number({ message: 'Введите сумму' })
    .positive('Сумма должна быть больше нуля'),

  type: z.enum(['income', 'expense']),

  category: z
    .string({ message: 'Выберите категорию' })
    .min(1, 'Выберите категорию'),

  // Optional in quick mode - auto-generated if empty
  description: z.string().optional(),

  date: z.string(),

  merchant: z.string().optional(),
});

export type QuickAddFormData = z.infer<typeof quickAddSchema>;

/**
 * Default descriptions for categories when not provided
 */
export const DEFAULT_DESCRIPTIONS: Record<string, string> = {
  food: 'Еда',
  groceries: 'Продукты',
  restaurants: 'Ресторан',
  coffee: 'Кофе',
  transport: 'Транспорт',
  taxi: 'Такси',
  'public-transport': 'Общ. транспорт',
  fuel: 'Топливо',
  shopping: 'Покупки',
  clothing: 'Одежда',
  electronics: 'Электроника',
  entertainment: 'Развлечения',
  hobbies: 'Хобби',
  sports: 'Спорт',
  bills: 'Счёт',
  utilities: 'Коммунальные',
  rent: 'Аренда',
  internet: 'Интернет',
  health: 'Здоровье',
  pharmacy: 'Аптека',
  fitness: 'Фитнес',
  education: 'Образование',
  courses: 'Курсы',
  other: 'Другое',
  salary: 'Зарплата',
  freelance: 'Фриланс',
  investment: 'Инвестиции',
  gift: 'Подарок',
  transfer: 'Перевод',
};
