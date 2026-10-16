import type { ReactNode } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { PastelColor } from '@/shared/lib/pastel/categoryColors';
import { CategoryTile } from './category';
import { Sheet } from './sheet';

export interface PickerCategory {
  id: string;
  name: string;
  color: PastelColor;
}

interface CategoryGroup {
  /** «Расходы», «Доходы» in the history filter; none for a single set. */
  label?: string;
  categories: PickerCategory[];
}

interface CategoryPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Says what is chosen: «Категория расхода», «Фильтр по категории». */
  title: string;
  groups: CategoryGroup[];
  selectedId?: string | null;
  /** AI's guess: dashed outline; pressing it confirms. */
  guessedId?: string | null;
  onSelect: (category: PickerCategory) => void;
  /** Filter only: the full-width «Все категории» tile. */
  allOption?: { label: string; selected: boolean; onSelect: () => void };
  /** Quick change from a list row: the operation's note and amount, and a way to the whole card. */
  context?: { text: string; onOpenOperation?: () => void };
}

/**
 * Category choice (docs/pastel/components/Picker.md): CategoryTile grid 4 per row, gap 10px; a press
 * selects and closes. The same sheet in the operation card, the AI review and the history filter.
 */
export function CategoryPicker({ open, onOpenChange, title, groups, selectedId, guessedId, onSelect, allOption, context }: CategoryPickerProps) {
  const pick = (category: PickerCategory) => {
    onSelect(category);
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      subtitle={
        context && (
          <div className="flex items-center justify-between gap-3">
            <span className="type-label min-w-0 truncate text-ink-muted">{context.text}</span>
            {context.onOpenOperation && (
              <button
                type="button"
                onClick={context.onOpenOperation}
                className="flex h-touch shrink-0 items-center gap-0.5 rounded-pill text-[14px] font-extrabold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
              >
                Вся операция <ChevronRight aria-hidden="true" className="size-4" strokeWidth={2.2} />
              </button>
            )}
          </div>
        )
      }
    >
      {allOption && (
        <button
          type="button"
          role="radio"
          aria-checked={allOption.selected}
          onClick={() => {
            allOption.onSelect();
            onOpenChange(false);
          }}
          className={cn(
            'flex h-key w-full items-center justify-center rounded-tile bg-sheet-card text-[14px] font-bold text-ink',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink',
            allOption.selected && 'ring-2 ring-ink ring-offset-2 ring-offset-sheet'
          )}
        >
          {allOption.label}
        </button>
      )}
      {groups.map((group, index) => (
        <div key={group.label ?? index} className="flex flex-col gap-2">
          {group.label && <p className="type-label text-ink-muted">{group.label}</p>}
          <div role="radiogroup" aria-label={group.label ?? title} className="grid grid-cols-4 gap-2.5">
            {group.categories.map((category) => (
              <CategoryTile
                key={category.id}
                name={category.name}
                color={category.color}
                selected={category.id === selectedId}
                guessed={category.id === guessedId}
                onSelect={() => pick(category)}
                className="ring-offset-sheet"
              />
            ))}
          </div>
        </div>
      ))}
    </Sheet>
  );
}

export interface PickerAccount {
  id: string;
  name: string;
  /** «1 250 000 сум», «420,00 USD». */
  balance: string;
}

interface AccountPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  accounts: PickerAccount[];
  selectedId?: string | null;
  onSelect: (account: PickerAccount) => void;
  footnote?: ReactNode;
}

/** Account choice: rows 60px with name and balance, a radio circle on the right. */
export function AccountPicker({ open, onOpenChange, title = 'Счёт', accounts, selectedId, onSelect, footnote }: AccountPickerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title}>
      <div role="radiogroup" aria-label={title} className="overflow-hidden rounded-card bg-sheet-card [&>*+*]:border-t [&>*+*]:border-line">
        {accounts.map((account) => {
          const checked = account.id === selectedId;
          return (
            <button
              key={account.id}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => {
                onSelect(account);
                onOpenChange(false);
              }}
              className="flex min-h-row w-full items-center gap-3 px-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="type-body-strong truncate text-ink">{account.name}</span>
                <span className="type-label text-ink-muted">{account.balance}</span>
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-pill',
                  checked ? 'bg-primary text-on-primary' : 'border-2 border-ink-muted'
                )}
              >
                {checked && <Check className="size-4" strokeWidth={2.6} />}
              </span>
            </button>
          );
        })}
      </div>
      {footnote}
    </Sheet>
  );
}
