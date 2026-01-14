import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format, addDays, addMonths, addQuarters, addYears } from 'date-fns';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/ui/form';
import { Calendar } from '@/shared/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { BudgetPeriod } from '@/shared/types';
import { createBudgetSchema, type CreateBudgetFormData } from '../model/schema';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/shared/lib';
import { useEffect } from 'react';

interface BudgetFormProps {
  onSubmit: (data: CreateBudgetFormData) => void;
  isLoading?: boolean;
  defaultValues?: Partial<CreateBudgetFormData>;
}

/**
 * Budget form component
 * Auto-calculates end date based on period
 */
export function BudgetForm({ onSubmit, isLoading, defaultValues }: BudgetFormProps) {
  const form = useForm<CreateBudgetFormData>({
    resolver: zodResolver(createBudgetSchema),
    defaultValues: {
      period: BudgetPeriod.MONTHLY,
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: format(addMonths(new Date(), 1), 'yyyy-MM-dd'),
      ...defaultValues,
    },
  });

  const period = form.watch('period');
  const startDate = form.watch('startDate');

  // Auto-calculate end date when period or start date changes
  useEffect(() => {
    if (!startDate || !period) return;

    const start = new Date(startDate);
    let end: Date;

    switch (period) {
      case BudgetPeriod.WEEKLY:
        end = addDays(start, 7);
        break;
      case BudgetPeriod.MONTHLY:
        end = addMonths(start, 1);
        break;
      case BudgetPeriod.QUARTERLY:
        end = addQuarters(start, 1);
        break;
      case BudgetPeriod.YEARLY:
        end = addYears(start, 1);
        break;
      default:
        return;
    }

    form.setValue('endDate', format(end, 'yyyy-MM-dd'));
  }, [period, startDate, form]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Name */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Название бюджета</FormLabel>
              <FormControl>
                <Input placeholder="Продукты" {...field} />
              </FormControl>
              <FormDescription>Краткое название для бюджета</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Amount */}
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Лимит (сўм)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="1000000"
                  {...field}
                  onChange={(e) => field.onChange(parseFloat(e.target.value))}
                />
              </FormControl>
              <FormDescription>Максимальная сумма для этого бюджета</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Period */}
        <FormField
          control={form.control}
          name="period"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Период</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите период" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={BudgetPeriod.WEEKLY}>Неделя</SelectItem>
                  <SelectItem value={BudgetPeriod.MONTHLY}>Месяц</SelectItem>
                  <SelectItem value={BudgetPeriod.QUARTERLY}>Квартал</SelectItem>
                  <SelectItem value={BudgetPeriod.YEARLY}>Год</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Start Date */}
        <FormField
          control={form.control}
          name="startDate"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Дата начала</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full pl-3 text-left font-normal',
                        !field.value && 'text-muted-foreground'
                      )}
                    >
                      {field.value ? format(new Date(field.value), 'dd.MM.yyyy') : 'Выберите дату'}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={field.value ? new Date(field.value) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        field.onChange(format(date, 'yyyy-MM-dd'));
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <FormDescription>Дата окончания рассчитается автоматически</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Description (Optional) */}
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Описание (необязательно)</FormLabel>
              <FormControl>
                <Input placeholder="Дополнительная информация о бюджете" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Submit Button */}
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Сохранение...' : 'Создать бюджет'}
        </Button>
      </form>
    </Form>
  );
}
