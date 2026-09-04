import { PenLine } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export interface CaptureDockActionProps {
  onClick: () => void;
  /** Matches the surrounding `Dock` item size so the pill lines up with the nav row. */
  size?: number;
  className?: string;
}

/**
 * The dock's primary action: start a quick capture.
 *
 * It is a labelled pill rather than another round icon because the label is the point — the
 * previous centre action was a bare `+` that opened the manual transaction form, i.e. the
 * slowest flow wearing the most prominent control. `Записать` names what this app is for, and
 * pressing it lands the user in the capture field instead of a form with six inputs.
 *
 * It claims nothing it cannot do: no recorder, no scanner. It only moves focus to the text
 * capture that already works, on Home. The manual form stays in the dock beside it, demoted to
 * ordinary nav weight (`Вручную`).
 *
 * `data-dock-center` is the stable hook the screenshot audit uses to measure centring
 * (`scripts/mobile-ui-audit.js`) — keep it if the label or icon changes.
 */
export function CaptureDockAction({ onClick, size = 44, className }: CaptureDockActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-dock-center="capture"
      aria-label="Записать операцию"
      style={{ height: size, minWidth: size }}
      className={cn(
        'relative flex shrink-0 items-center justify-center gap-1.5 rounded-full border-0 px-4',
        'bg-primary text-primary-foreground shadow-sm shadow-black/15',
        'cursor-pointer outline-none transition-colors active:scale-95',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className
      )}
    >
      <PenLine className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      <span className="text-sm font-medium leading-none">Записать</span>
    </button>
  );
}
