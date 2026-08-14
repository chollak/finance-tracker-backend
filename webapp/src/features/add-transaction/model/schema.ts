import { TRANSACTION_SEMANTIC_TYPES } from '@/shared/types';
import { z } from 'zod';

/**
 * Zod validation schema for transaction creation
 */
export const addTransactionSchema = z.object({
  amount: z
    .number({ message: 'Введите корректную сумму' })
    .positive('Сумма должна быть больше нуля'),

  // What kind of movement this is. Direction (income/expense) is derived from
  // it, so the form never asks the same question twice.
  semanticType: z.enum(TRANSACTION_SEMANTIC_TYPES, { message: 'Выберите тип операции' }),

  category: z
    .string({ message: 'Выберите категорию' })
    .min(1, 'Категория обязательна'),

  description: z
    .string({ message: 'Описание обязательно' })
    .min(1, 'Описание обязательно')
    .max(200, 'Описание слишком длинное'),

  date: z.string({ message: 'Дата обязательна' }),

  // The API returns null for a merchant that was never filled in, and the edit
  // form seeds its fields straight from that response.
  merchant: z.string().nullable().optional(),
});

export type AddTransactionFormData = z.infer<typeof addTransactionSchema>;
