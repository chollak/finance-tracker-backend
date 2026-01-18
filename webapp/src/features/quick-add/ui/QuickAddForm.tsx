import { useState, useRef, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, Calendar as CalendarIcon } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { AutocompleteInput } from '@/shared/ui/autocomplete-input';
import { Calendar } from '@/shared/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/shared/ui/form';
import {
  getCategoriesByType,
  type Category,
  ALL_CATEGORIES,
} from '@/entities/category';
import { useTransactions } from '@/entities/transaction';
import { useUserStore } from '@/entities/user/model/store';

import { quickAddSchema, DEFAULT_DESCRIPTIONS, type QuickAddFormData } from '../model/schema';

interface QuickAddFormProps {
  onSubmit: (data: QuickAddFormData) => void;
  isLoading?: boolean;
  defaultType?: 'income' | 'expense';
  onClose?: () => void;
}

/**
 * Quick Add Form - Amount-first entry with recent categories
 */
export function QuickAddForm({
  onSubmit,
  isLoading,
  defaultType = 'expense',
  onClose,
}: QuickAddFormProps) {
  const [showDetails, setShowDetails] = useState(false);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const userId = useUserStore((state) => state.userId);
  const { data: transactions } = useTransactions(userId);

  const form = useForm<QuickAddFormData>({
    resolver: zodResolver(quickAddSchema),
    defaultValues: {
      type: defaultType,
      date: format(new Date(), 'yyyy-MM-dd'),
      description: '',
      merchant: '',
    },
  });

  const transactionType = form.watch('type');
  const selectedCategory = form.watch('category');
  const categories = getCategoriesByType(transactionType);

  // Auto-focus amount input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      amountInputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Get recent categories from transaction history
  const recentCategories = useMemo(() => {
    if (!transactions || transactions.length === 0) {
      // Default popular categories if no history
      return transactionType === 'expense'
        ? ['food', 'transport', 'shopping', 'coffee', 'restaurants']
        : ['salary', 'freelance', 'gift'];
    }

    // Get categories from recent transactions of same type
    const recentCats = transactions
      .filter((t) => t.type === transactionType)
      .slice(0, 20)
      .map((t) => t.category)
      .filter((cat, idx, arr) => arr.indexOf(cat) === idx) // unique
      .slice(0, 5);

    // If not enough recent, add defaults
    const defaults =
      transactionType === 'expense'
        ? ['food', 'transport', 'shopping']
        : ['salary', 'freelance'];

    return [...new Set([...recentCats, ...defaults])].slice(0, 5);
  }, [transactions, transactionType]);

  // Get unique merchants from transaction history for auto-suggest
  const recentMerchants = useMemo(() => {
    if (!transactions || transactions.length === 0) return [];

    return transactions
      .map((t) => t.merchant)
      .filter((m): m is string => !!m && m.trim() !== '') // filter out empty
      .filter((m, idx, arr) => arr.indexOf(m) === idx) // unique
      .slice(0, 20); // limit to 20 recent merchants
  }, [transactions]);

  // Handle form submission
  const handleSubmit = (data: QuickAddFormData) => {
    // Auto-generate description if empty
    const finalData = {
      ...data,
      description:
        data.description?.trim() || DEFAULT_DESCRIPTIONS[data.category] || data.category,
    };
    onSubmit(finalData);
  };

  // Get category info
  const getCategoryInfo = (catId: string): Category | undefined => {
    return ALL_CATEGORIES.find((c) => c.id === catId);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        {/* Type Toggle - Inline buttons */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant={transactionType === 'expense' ? 'expense' : 'outline'}
            className="flex-1 transition-all"
            onClick={() => {
              form.setValue('type', 'expense');
              form.setValue('category', ''); // Reset category on type change
            }}
          >
            Расход
          </Button>
          <Button
            type="button"
            variant={transactionType === 'income' ? 'income' : 'outline'}
            className="flex-1 transition-all"
            onClick={() => {
              form.setValue('type', 'income');
              form.setValue('category', ''); // Reset category on type change
            }}
          >
            Доход
          </Button>
        </div>

        {/* Amount Input - Large, centered */}
        <FormField
          control={form.control}
          name="amount"
          render={({ field: { ref, ...field } }) => (
            <FormItem>
              <FormControl>
                <div className="relative">
                  <Input
                    ref={(el) => {
                      ref(el);
                      (amountInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
                    }}
                    type="number"
                    inputMode="decimal"
                    placeholder="0"
                    className="h-20 text-center text-4xl font-bold border-2 focus:border-primary"
                    {...field}
                    value={field.value || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      field.onChange(value ? parseFloat(value) : undefined);
                    }}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">
                    сўм
                  </span>
                </div>
              </FormControl>
              <FormMessage className="text-center" />
            </FormItem>
          )}
        />

        {/* Recent Categories - Quick select pills */}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Недавние категории</p>
          <div className="flex flex-wrap gap-2">
            {recentCategories.map((catId) => {
              const cat = getCategoryInfo(catId);
              if (!cat) return null;
              const isSelected = selectedCategory === catId;
              return (
                <Button
                  key={catId}
                  type="button"
                  variant={isSelected ? (transactionType === 'expense' ? 'expense' : 'income') : 'outline'}
                  size="sm"
                  className="transition-all"
                  onClick={() => form.setValue('category', catId)}
                >
                  {cat.icon} {cat.name}
                </Button>
              );
            })}
          </div>
        </div>

        {/* All Categories - Scrollable grid */}
        <FormField
          control={form.control}
          name="category"
          render={() => (
            <FormItem>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Все категории</p>
                <div className="max-h-32 overflow-y-auto">
                  <div className="grid grid-cols-3 gap-1">
                    {categories.map((cat) => {
                      const isSelected = selectedCategory === cat.id;
                      return (
                        <Button
                          key={cat.id}
                          type="button"
                          variant={isSelected ? (transactionType === 'expense' ? 'expense' : 'income') : 'ghost'}
                          size="sm"
                          className="justify-start text-xs h-8"
                          onClick={() => form.setValue('category', cat.id)}
                        >
                          {cat.icon} {cat.name}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Expandable Details Section */}
        <div className="border rounded-lg">
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-between"
            onClick={() => setShowDetails(!showDetails)}
          >
            <span className="text-muted-foreground">Детали (опционально)</span>
            {showDetails ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>

          {showDetails && (
            <div className="p-4 pt-0 space-y-4">
              {/* Description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        placeholder="Описание (авто-заполнится если пусто)"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Merchant with Auto-suggest */}
              <FormField
                control={form.control}
                name="merchant"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <AutocompleteInput
                        value={field.value || ''}
                        onChange={field.onChange}
                        suggestions={recentMerchants}
                        placeholder="Место / Магазин"
                      />
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
                  <FormItem>
                    <div className="flex gap-2">
                      {/* Quick date buttons */}
                      <Button
                        type="button"
                        variant={
                          field.value === format(new Date(), 'yyyy-MM-dd')
                            ? 'default'
                            : 'outline'
                        }
                        size="sm"
                        onClick={() =>
                          field.onChange(format(new Date(), 'yyyy-MM-dd'))
                        }
                      >
                        Сегодня
                      </Button>
                      <Button
                        type="button"
                        variant={
                          field.value ===
                          format(
                            new Date(Date.now() - 86400000),
                            'yyyy-MM-dd'
                          )
                            ? 'default'
                            : 'outline'
                        }
                        size="sm"
                        onClick={() =>
                          field.onChange(
                            format(
                              new Date(Date.now() - 86400000),
                              'yyyy-MM-dd'
                            )
                          )
                        }
                      >
                        Вчера
                      </Button>

                      {/* Calendar picker */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm">
                            <CalendarIcon className="h-4 w-4 mr-1" />
                            {format(new Date(field.value), 'dd.MM')}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={new Date(field.value)}
                            onSelect={(date) => {
                              if (date) {
                                field.onChange(format(date, 'yyyy-MM-dd'));
                              }
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="flex gap-2 pt-2">
          {onClose && (
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onClose}
            >
              Отмена
            </Button>
          )}
          <Button
            type="submit"
            variant={transactionType === 'expense' ? 'expense' : 'income'}
            className="flex-1"
            disabled={isLoading || !selectedCategory}
          >
            {isLoading ? 'Сохранение...' : 'Добавить'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
