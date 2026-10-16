import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
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
import { findCategory, pickableCategories, useCategories, type Category } from '@/entities/category';
import { addTransactionSchema, type AddTransactionFormData } from '../model/schema';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/shared/lib';

/** What the form submits: `category` is the category's name, `categoryId` its id (FT-100). */
export type TransactionFormResult = AddTransactionFormData & { categoryId?: string };

interface TransactionFormProps {
  onSubmit: (data: TransactionFormResult) => void;
  isLoading?: boolean;
  /** `category` may be a category id or a name; a name is matched to the user's category. */
  defaultValues?: Partial<AddTransactionFormData>;
}

/**
 * Transaction form component
 * Used for both adding and editing transactions. The category field holds the id of one of the
 * user's categories from the API.
 */
export function TransactionForm({ onSubmit, isLoading, defaultValues }: TransactionFormProps) {
  const form = useForm<AddTransactionFormData>({
    resolver: zodResolver(addTransactionSchema),
    defaultValues: {
      type: 'expense',
      date: format(new Date(), 'yyyy-MM-dd'),
      amount: undefined,
      category: '',
      description: '',
      merchant: '',
      ...defaultValues,
    },
  });

  const transactionType = form.watch('type');
  const selected = form.watch('category');
  const { data: allCategories } = useCategories();
  const categories = pickableCategories(allCategories, transactionType);

  // An edited record may arrive with its category's name (guest mode) or with a category of the
  // other type after a type switch: pick the matching id, or clear the field.
  useEffect(() => {
    if (!allCategories || !selected || findCategory(categories, selected)) return;
    const byName = categories.find((category) => category.name === selected);
    form.setValue('category', byName?.id ?? '');
  }, [allCategories, categories, selected, form]);

  const submit = (data: AddTransactionFormData) => {
    const category = findCategory(categories, data.category);
    onSubmit({ ...data, category: category?.name ?? data.category, categoryId: category?.id });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="space-y-6">
        {/* Type Selection */}
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Тип транзакции</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ''}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите тип" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="expense">Расход</SelectItem>
                  <SelectItem value="income">Доход</SelectItem>
                </SelectContent>
              </Select>
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
              <FormLabel>Сумма (сўм)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="50000"
                  {...field}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                />
              </FormControl>
              <FormDescription>Введите сумму в узбекских сумах</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Category */}
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Категория</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ''}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите категорию" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {categories.map((category: Category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Description */}
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Описание</FormLabel>
              <FormControl>
                <Input placeholder="Обед в ресторане" {...field} value={field.value || ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Date */}
        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Дата</FormLabel>
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
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Merchant (Optional) */}
        <FormField
          control={form.control}
          name="merchant"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Место (необязательно)</FormLabel>
              <FormControl>
                <Input placeholder="Название магазина или заведения" {...field} value={field.value || ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Submit Button */}
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Сохранение...' : 'Сохранить транзакцию'}
        </Button>
      </form>
    </Form>
  );
}
