import { useState } from 'react';
import type { Account } from '@/entities/account';
import { findCategory, type Category } from '@/entities/category';
import { cn } from '@/shared/lib/utils';
import { pastelBgClass } from '@/shared/lib/pastel/categoryColors';
import { CategoryPicker, OptionPicker } from '@/shared/ui/pastel';
import { categoryFilterGroups, TYPE_FILTER, typeChipLabel } from '../model/historyFilters';
import type { HistoryFiltersModel } from '../model/useHistoryFilters';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

/** FilterChips.md: 44px pills, 14px/700; off — `card` with `ink`, on — `primary` with `on-primary`. */
function chipClass(on: boolean): string {
  return cn(
    'flex h-touch shrink-0 items-center whitespace-nowrap rounded-pill text-[14px] font-bold transition-colors duration-150',
    on ? 'bg-primary text-on-primary' : 'bg-card text-ink',
    FOCUS
  );
}

const CHEVRON = (
  <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
    <path d="M5 7.5 10 12.5l5-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * The search field (SearchField.md): a 52px pill on `card`, the magnifier in `muted`, the field 15px/600 with the
 * hint «Такси, кафе, 25 000…», and «Очистить поиск» on `track` once there is text. History follows every character;
 * the keyboard's key is «Поиск», which only hides the keyboard.
 */
function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div role="search" className="flex h-control items-center gap-2 rounded-pill bg-card pl-[18px] pr-1 focus-within:ring-2 focus-within:ring-ink">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0 text-ink-muted">
        <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="m13.2 13.2 3.6 3.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <label className="flex h-full min-w-0 flex-1 items-center">
        <span className="sr-only">Поиск по операциям</span>
        <input
          type="search"
          enterKeyHint="search"
          // The server reads at most 100 characters (FT-107)
          maxLength={100}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          placeholder="Такси, кафе, 25 000…"
          className={cn(
            'h-touch min-w-0 flex-1 appearance-none bg-transparent text-[15px] font-semibold text-ink outline-none placeholder:text-ink-muted',
            '[&::-webkit-search-cancel-button]:appearance-none'
          )}
        />
      </label>
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Очистить поиск"
          className="flex size-touch shrink-0 items-center justify-center rounded-pill bg-track text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5.5 5.5l9 9m0-9-9 9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

export interface HistoryFiltersProps {
  filters: HistoryFiltersModel;
  /** The user's categories, hidden ones too (a chosen hidden category still names itself on the chip). */
  categories: readonly Category[] | undefined;
  /** The accounts offered as chips, in their order. */
  accounts: readonly Account[];
  /** «2 операции · −109 000 сум» when a narrowed History found something; null hides the line. */
  result: string | null;
}

/**
 * The top of History (FT-116, boards «История» and «История · «такси» + Наличные»): the search field; the chips —
 * «Категория ▾» opening the category filter, then one chip per account (one at a time, a second press lets go), then
 * «Тип ▾» opening the choice of «Все / Расходы / Доходы» (the Definition of Done's type filter, which the boards do
 * not draw: last in the row, so the row reads as on the boards), scrolling sideways; and, when the search or a filter
 * found something, the line with what it found and «Сбросить».
 */
export function HistoryFilters({ filters, categories, accounts, result }: HistoryFiltersProps) {
  const [picking, setPicking] = useState<'category' | 'type' | null>(null);
  const category = findCategory(categories, filters.query.categoryId ?? undefined);
  const type = filters.query.type;

  return (
    <>
      <SearchField value={filters.text} onChange={filters.setText} />

      <div role="group" aria-label="Фильтры" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setPicking('category')}
          aria-label={category ? `Категория: ${category.name}. Изменить фильтр` : 'Фильтр по категории'}
          className={cn(chipClass(category !== undefined), 'gap-1.5 pl-4 pr-3')}
        >
          {category && <span aria-hidden="true" className={cn('size-3 shrink-0 rounded-pill', pastelBgClass[category.color])} />}
          <span>{category?.name ?? 'Категория'}</span>
          {CHEVRON}
        </button>
        {accounts.map((account) => {
          const pressed = filters.query.accountId === account.id;
          return (
            <button
              key={account.id}
              type="button"
              aria-pressed={pressed}
              onClick={() => filters.toggleAccount(account.id)}
              className={cn(chipClass(pressed), 'px-4')}
            >
              {account.name}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setPicking('type')}
          aria-label={type ? `Тип: ${typeChipLabel(type)}. Изменить фильтр` : 'Фильтр по типу'}
          className={cn(chipClass(type !== null), 'gap-1.5 pl-4 pr-3')}
        >
          <span>{typeChipLabel(type)}</span>
          {CHEVRON}
        </button>
      </div>

      {result && (
        <div className="flex min-h-7 items-center justify-between gap-2">
          <span aria-live="polite" className="type-label min-w-0 text-ink-muted">
            {result}
          </span>
          <button
            type="button"
            onClick={filters.reset}
            className="-my-2 -mr-2.5 h-touch shrink-0 rounded-pill px-2.5 text-[14px] font-extrabold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            Сбросить
          </button>
        </div>
      )}

      <CategoryPicker
        open={picking === 'category'}
        onOpenChange={(open) => setPicking(open ? 'category' : null)}
        title="Фильтр по категории"
        groups={categoryFilterGroups(categories)}
        selectedId={filters.query.categoryId}
        onSelect={(picked) => filters.chooseCategory(picked.id)}
        allOption={{ label: 'Все категории', selected: filters.query.categoryId === null, onSelect: () => filters.chooseCategory(null) }}
      />
      <OptionPicker
        open={picking === 'type'}
        onOpenChange={(open) => setPicking(open ? 'type' : null)}
        title={TYPE_FILTER.title}
        options={TYPE_FILTER.options.map(({ id, name }) => ({ id, name }))}
        selectedId={TYPE_FILTER.options.find((option) => option.type === type)?.id}
        onSelect={(picked) => filters.chooseType(TYPE_FILTER.options.find((option) => option.id === picked.id)?.type ?? null)}
      />
    </>
  );
}
