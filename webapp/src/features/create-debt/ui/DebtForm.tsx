import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Checkbox } from '@/shared/ui/checkbox';
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
import { createDebtSchema, type CreateDebtFormData } from '../model/schema';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/shared/lib';

interface DebtFormProps {
  onSubmit: (data: CreateDebtFormData) => void;
  isLoading?: boolean;
  defaultValues?: Partial<CreateDebtFormData>;
  submitButtonText?: string;
}

/**
 * Debt form component
 */
export function DebtForm({ onSubmit, isLoading, defaultValues, submitButtonText = 'Создать долг' }: DebtFormProps) {
  const form = useForm<CreateDebtFormData>({
    resolver: zodResolver(createDebtSchema),
    defaultValues: {
      type: 'i_owe',
      currency: 'UZS',
      moneyTransferred: false,
      ...defaultValues,
    },
  });

  const debtType = form.watch('type');

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Debt Type Toggle */}
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Тип долга</FormLabel>
              <FormControl>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => field.onChange('i_owe')}
                    className={cn(
                      'flex flex-col items-center p-4 rounded-xl border-2 transition-all',
                      field.value === 'i_owe'
                        ? 'border-expense bg-expense/10'
                        : 'border-muted hover:border-muted-foreground/20'
                    )}
                  >
                    <span className="text-2xl mb-2">📤</span>
                    <span className="font-medium">Я должен</span>
                    <span className="text-xs text-muted-foreground">Мне дали в долг</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => field.onChange('owed_to_me')}
                    className={cn(
                      'flex flex-col items-center p-4 rounded-xl border-2 transition-all',
                      field.value === 'owed_to_me'
                        ? 'border-income bg-income/10'
                        : 'border-muted hover:border-muted-foreground/20'
                    )}
                  >
                    <span className="text-2xl mb-2">📥</span>
                    <span className="font-medium">Мне должны</span>
                    <span className="text-xs text-muted-foreground">Я дал в долг</span>
                  </button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Person Name */}
        <FormField
          control={form.control}
          name="personName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {debtType === 'i_owe' ? 'Кому я должен' : 'Кто мне должен'}
              </FormLabel>
              <FormControl>
                <Input placeholder="Имя человека" {...field} />
              </FormControl>
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
              <FormLabel>Сумма</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="100000"
                  {...field}
                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                />
              </FormControl>
              <FormDescription>Сумма долга в сўмах</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Due Date (Optional) */}
        <FormField
          control={form.control}
          name="dueDate"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Срок возврата (необязательно)</FormLabel>
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
                    disabled={(date) => date < new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
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
                <Input placeholder="За что долг?" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Money Transferred Checkbox */}
        <FormField
          control={form.control}
          name="moneyTransferred"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Деньги уже переданы</FormLabel>
                <FormDescription>
                  {debtType === 'i_owe'
                    ? 'Отметьте, если вы уже получили деньги. Будет создана транзакция дохода.'
                    : 'Отметьте, если вы уже отдали деньги. Будет создана транзакция расхода.'
                  }
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        {/* Submit Button */}
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Сохранение...' : submitButtonText}
        </Button>
      </form>
    </Form>
  );
}
