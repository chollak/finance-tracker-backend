import { z } from 'zod';
import { BudgetPeriod } from '@/shared/types';

/**
 * Zod validation schema for budget creation
 */
export const createBudgetSchema = z.object({
  name: z
    .string({ message: 'Название обязательно' })
    .min(1, 'Название обязательно')
    .max(100, 'Название слишком длинное'),

  amount: z
    .number({ message: 'Введите корректную сумму' })
    .positive('Сумма должна быть больше нуля'),

  period: z.enum([BudgetPeriod.WEEKLY, BudgetPeriod.MONTHLY, BudgetPeriod.QUARTERLY, BudgetPeriod.YEARLY] as const, {
    message: 'Выберите период',
  }),

  startDate: z.string({ message: 'Дата начала обязательна' }),

  endDate: z.string({ message: 'Дата окончания обязательна' }),

  categoryIds: z.array(z.string()).optional(),

  description: z.string().max(500, 'Описание слишком длинное').optional(),
});

export type CreateBudgetFormData = z.infer<typeof createBudgetSchema>;
