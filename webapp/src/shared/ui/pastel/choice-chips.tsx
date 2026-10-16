import { cn } from '@/shared/lib/utils';

interface ChoiceChipsProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

/** Pills in a radiogroup, 44px: the time choice under a switch («20:00 21:00 22:00 23:00»). */
export function ChoiceChips<T extends string>({ options, value, onChange, ariaLabel, className }: ChoiceChipsProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('flex flex-wrap gap-2', className)}>
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-touch rounded-pill px-4 text-[14px] font-bold transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink',
              checked ? 'bg-primary text-on-primary' : 'bg-sheet-track text-ink'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
