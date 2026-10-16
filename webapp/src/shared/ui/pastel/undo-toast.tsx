import { useEffect } from 'react';
import { Check, Info, Trash2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { msUntilChange, useUndoToastStore, visibleEntry } from '@/shared/lib/undo';

interface UndoToastProps {
  /** Distance from the bottom edge: above the composer on Home, at the edge in History. */
  bottom?: number;
}

/**
 * The action toast of «Пастель» (docs/pastel/components/Toast.md): primary card, two lines, «Отменить»
 * on the right when the action can really be undone. Each action lives 4 seconds; undo goes from the
 * latest. Hidden while a sheet is open. Mount once per screen.
 */
export function UndoToast({ bottom = 16 }: UndoToastProps) {
  const stack = useUndoToastStore((state) => state.stack);
  const openSheets = useUndoToastStore((state) => state.openSheets);
  const undoVisible = useUndoToastStore((state) => state.undoVisible);
  const now = useUndoToastStore((state) => state.now);
  const tick = useUndoToastStore((state) => state.tick);

  // Redraw exactly when the visible toast runs out (the previous one may show again).
  useEffect(() => {
    const wait = msUntilChange(stack, now);
    if (wait === null) return;
    const timer = window.setTimeout(tick, wait + 20);
    return () => window.clearTimeout(timer);
  }, [stack, now, tick]);

  const entry = openSheets > 0 ? null : visibleEntry(stack, now);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
      style={{ bottom: `calc(${bottom}px + env(safe-area-inset-bottom, 0px))` }}
    >
      {entry && (
        <div
          key={entry.id}
          className="pointer-events-auto flex min-h-14 w-full max-w-md items-center gap-3 rounded-card bg-primary py-2 pl-3 pr-2 text-on-primary animate-fade-in-up"
        >
          <span
            aria-hidden="true"
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-pill [&_svg]:size-4',
              entry.kind === 'deleted' || entry.kind === 'info' ? 'text-on-primary' : 'bg-pastel-mint text-mint-ink'
            )}
          >
            {entry.kind === 'deleted' ? <Trash2 strokeWidth={2} /> : entry.kind === 'info' ? <Info strokeWidth={2} /> : <Check strokeWidth={2.4} />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[14px] font-extrabold leading-snug">{entry.title}</span>
            {entry.detail && <span className="truncate text-[13px] font-semibold leading-snug text-on-primary-muted">{entry.detail}</span>}
          </span>
          {entry.undo && (
            <button
              type="button"
              onClick={() => void undoVisible()}
              className="h-touch shrink-0 rounded-pill px-3 text-[14px] font-extrabold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-primary"
            >
              Отменить
            </button>
          )}
        </div>
      )}
    </div>
  );
}
