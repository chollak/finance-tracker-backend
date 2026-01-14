import { z } from 'zod';

/**
 * Zod validation schema for transaction creation
 */
export const addTransactionSchema = z.object({
  amount: z
    .number({ message: 'Введите корректную сумму' })
    .positive('Сумма должна быть больше нуля'),

  type: z.enum(['income', 'expense'], { message: 'Выберите тип транзакции' }),

  category: z
    .string({ message: 'Выберите категорию' })
    .min(1, 'Категория обязательна'),

  description: z
    .string({ message: 'Описание обязательно' })
    .min(1, 'Описание обязательно')
    .max(200, 'Описание слишком длинное'),

  date: z.string({ message: 'Дата обязательна' }),

  merchant: z.string().optional(),
});

export type AddTransactionFormData = z.infer<typeof addTransactionSchema>;
