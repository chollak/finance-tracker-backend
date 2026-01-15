import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { Button } from '@/shared/ui/button';
import { useTransactionFiltersStore } from '../model/store';
import { Search, X } from 'lucide-react';
import { useDebounce } from '@/shared/hooks';
import { useEffect, useState } from 'react';

/**
 * Transaction filter bar
 * Includes search, type filter, and reset
 */
export function FilterBar() {
  const {
    searchQuery,
    typeFilter,
    setSearchQuery,
    setTypeFilter,
    resetFilters,
  } = useTransactionFiltersStore();

  const [localSearch, setLocalSearch] = useState(searchQuery);
  const debouncedSearch = useDebounce(localSearch, 300);

  // Update store when debounced search changes
  useEffect(() => {
    setSearchQuery(debouncedSearch);
  }, [debouncedSearch, setSearchQuery]);

  const hasActiveFilters = searchQuery || typeFilter !== 'all';

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      {/* Search Input */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Поиск транзакций..."
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Type Filter */}
      <Select value={typeFilter} onValueChange={setTypeFilter}>
        <SelectTrigger className="w-full sm:w-[160px]">
          <SelectValue placeholder="Тип" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Все</SelectItem>
          <SelectItem value="income">Доходы</SelectItem>
          <SelectItem value="expense">Расходы</SelectItem>
        </SelectContent>
      </Select>

      {/* Reset Button */}
      {hasActiveFilters && (
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            resetFilters();
            setLocalSearch('');
          }}
          title="Сбросить фильтры"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
