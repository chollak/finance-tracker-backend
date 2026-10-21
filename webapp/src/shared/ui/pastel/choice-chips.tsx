import type { KeyboardEvent } from 'react';
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
  // Radio-group keyboard pattern: one tab stop, arrows move and select.
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[next]?.focus();
  };
  const focusable = options.some((option) => option.value === value) ? value : options[0]?.value;

  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('flex flex-wrap gap-2', className)}>
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={option.value === focusable ? 0 : -1}
            onKeyDown={(event) => move(event, index)}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-touch rounded-pill px-4 text-[15px] font-extrabold tabular-nums transition-colors duration-150',
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
