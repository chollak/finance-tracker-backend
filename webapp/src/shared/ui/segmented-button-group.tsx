import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

interface SegmentedButtonOption<T extends string> {
  value: T;
  label: ReactNode;
}

interface SegmentedButtonGroupProps<T extends string> {
  options: SegmentedButtonOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}

/**
 * Segmented control for local UI state, matching Radix Tabs visual style.
 */
export function SegmentedButtonGroup<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: SegmentedButtonGroupProps<T>) {
  return (
    <div
      className={cn('mb-4 grid h-12 w-full rounded-2xl bg-muted p-1 text-muted-foreground', className)}
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const isActive = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center justify-center whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isActive
                ? 'bg-background text-foreground shadow'
                : 'hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
