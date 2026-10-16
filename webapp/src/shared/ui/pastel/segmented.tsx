import { cn } from '@/shared/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Names the group for screen readers: «Тип операции». */
  ariaLabel: string;
  /** Repeated press clears the choice (used by «Нужно / Лишнее» in the audit). */
  allowDeselect?: boolean;
  onClear?: () => void;
  className?: string;
}

/**
 * Two-way switch (docs/pastel/components/Segmented.md): track 48px with 2px inset, 44px segments,
 * active segment seg-on with shadow-seg, inactive text seg-off.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  allowDeselect = false,
  onClear,
  className,
}: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} className={cn('flex h-12 rounded-pill bg-track p-0.5', className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => (active && allowDeselect ? onClear?.() : onChange(option.value))}
            className={cn(
              'flex h-touch min-w-0 flex-1 items-center justify-center rounded-pill px-3 text-[14px] font-bold transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink',
              active ? 'bg-seg-on text-ink shadow-segment' : 'text-seg-off'
            )}
          >
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
