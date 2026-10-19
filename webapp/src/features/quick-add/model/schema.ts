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
