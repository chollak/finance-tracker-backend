import { cn } from '@/shared/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /**
   * Cannot be chosen right now («USD» without a rate): stays in its place dimmed and announced as
   * unavailable, but focusable, so its reason is heard; pressing it calls `onUnavailable` instead.
   */
  unavailable?: boolean;
  /** The accessible name when it says more than the label: «USD — курса доллара пока нет». */
  ariaLabel?: string;
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
  /** An unavailable segment was pressed: the screen says why it cannot be chosen. */
  onUnavailable?: (value: T) => void;
  /**
   * Inside a Sheet: track `sheet-track` with a `card` knob, as the boards draw it («Курс доллара», «Новый счёт»,
   * «Изменить или скрыть счёт»). On a sheet the screen's track and seg-on would be the same colour in dark.
   */
  inSheet?: boolean;
  /** Labels at 800 instead of 700: the audit's «Нужно / Лишнее», as the board «Ревизия · начало» draws them. */
  strong?: boolean;
  className?: string;
}

/**
 * Two-way switch (docs/pastel/components/Segmented.md): track 48px with 2px inset, 44px segments,
 * active segment seg-on with shadow-seg, inactive text seg-off; in a sheet the track is sheet-track and the
 * knob card. Labels 14px, 700; `strong` — 800. An unavailable segment is dimmed to 0.35, as the other unavailable controls of «Пастель» are
 * (Calendar.md, MonthStepper.md).
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  allowDeselect = false,
  onClear,
  onUnavailable,
  inSheet = false,
  strong = false,
  className,
}: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} className={cn('flex h-12 rounded-pill p-0.5', inSheet ? 'bg-sheet-track' : 'bg-track', className)}>
      {options.map((option) => {
        const active = option.value === value;
        const press = () => {
          if (option.unavailable) onUnavailable?.(option.value);
          else if (active && allowDeselect) onClear?.();
          else onChange(option.value);
        };
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            aria-disabled={option.unavailable || undefined}
            aria-label={option.ariaLabel}
            onClick={press}
            className={cn(
              'flex h-touch min-w-0 flex-1 items-center justify-center rounded-pill px-3 text-[14px] transition-colors duration-150',
              strong ? 'font-extrabold' : 'font-bold',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink',
              active ? cn(inSheet ? 'bg-card' : 'bg-seg-on', 'text-ink shadow-segment') : 'text-seg-off',
              option.unavailable && 'opacity-35'
            )}
          >
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
