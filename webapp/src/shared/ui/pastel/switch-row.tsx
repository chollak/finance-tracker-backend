import { cn } from '@/shared/lib/utils';

interface SwitchRowProps {
  /** An action, not a state: «Присылать сводку», «Предупреждать». */
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

/**
 * On/off row inside a settings sheet (docs/pastel/components/Switch.md): the whole 60px row is the
 * switch. On — primary track, 24px on-primary knob right. Off — transparent track with a 2px muted
 * outline and an 18px muted knob left, visible on sheet-card in both themes.
 */
export function SwitchRow({ label, checked, onChange, className }: SwitchRowProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex min-h-row w-full items-center justify-between gap-4 text-left text-[15px] font-bold text-ink',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink rounded-card',
        className
      )}
    >
      <span className="min-w-0">{label}</span>
      <span
        aria-hidden="true"
        className={cn(
          'relative inline-flex h-8 w-[52px] shrink-0 items-center rounded-pill transition-colors duration-150',
          checked ? 'bg-primary' : 'border-2 border-ink-muted bg-transparent'
        )}
      >
        <span
          className={cn(
            'absolute rounded-pill transition-[left,width,height] duration-150',
            checked ? 'left-[24px] size-6 bg-on-primary' : 'left-[5px] size-[18px] bg-ink-muted'
          )}
        />
      </span>
    </button>
  );
}
