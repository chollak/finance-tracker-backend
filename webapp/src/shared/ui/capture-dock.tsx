import { PenLine } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export interface CaptureDockActionProps {
  onClick: () => void;
  /** Matches the surrounding `Dock` item size so the slot lines up with the nav row. */
  size?: number;
  className?: string;
}

/**
 * The dock's capture action, as the third of four equal slots.
 *
 * It was a wide filled pill in the middle of a floating dock — the loudest thing on the screen
 * after the day's amount. That was backwards: capture is what the app is for, but *navigation*
 * is not, and the pill spent its prominence on the chrome rather than on the number and the
 * input field the product is actually about. The design guidelines say the same thing from the
 * other side — nav chrome uses neutral tokens, and a screen's creation action does not float
 * over the bottom nav.
 *
 * So the action keeps its position and its name and gives up its size: one filled disc the width
 * of an icon, a label like every other slot. Filled, so it still reads as the one thing here
 * that does rather than goes.
 *
 * `data-dock-center` is the stable hook the screenshot audit uses (`scripts/mobile-ui-audit.js`)
 * — keep it if the label or icon changes.
 */
export function CaptureDockAction({ onClick, size = 44, className }: CaptureDockActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-dock-center="capture"
      aria-label="Записать операцию"
      style={{ minHeight: size + 12 }}
      className={cn(
        'relative flex w-full flex-col items-center justify-center gap-1 rounded-2xl border-0 px-1 py-2',
        'cursor-pointer text-foreground outline-none transition-colors active:scale-95',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        className
      )}
    >
      <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-primary text-primary-foreground">
        <PenLine className="h-[15px] w-[15px]" aria-hidden="true" />
      </span>
      <span className="max-w-full truncate text-[10px] font-semibold leading-none">Записать</span>
    </button>
  );
}
