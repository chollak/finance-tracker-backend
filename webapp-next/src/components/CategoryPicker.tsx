import { EXPENSE_CATEGORIES } from '../lib/categories';
import { hapticSelection } from '../lib/haptic';

/**
 * Категории пилюлями, выбранная залита. Списком в 35 строк это было бы
 * пролистывание, пилюлями — обзор.
 */
export function CategoryPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 px-[18px] pb-[18px]">
      {EXPENSE_CATEGORIES.map((category) => {
        const selected = category.id === value;
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => {
              hapticSelection();
              onChange(category.id);
            }}
            // 44px — минимальный тач-таргет; ниже палец промахивается.
            className={`flex min-h-[44px] items-center rounded-full px-4 text-[14px] active:scale-95 ${
              selected ? 'bg-text font-bold text-bg' : 'bg-fill text-text'
            }`}
          >
            {category.name}
          </button>
        );
      })}
    </div>
  );
}
