import { z } from 'zod';

export const createDebtSchema = z.object({
  type: z.enum(['i_owe', 'owed_to_me']),
  personName: z.string().min(1, 'Укажите имя'),
  amount: z.number().positive('Сумма должна быть положительной'),
  currency: z.string().optional(),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  moneyTransferred: z.boolean().optional(),
});

export type CreateDebtFormData = z.infer<typeof createDebtSchema>;
