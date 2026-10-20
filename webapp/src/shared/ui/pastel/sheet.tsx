import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useUndoToastStore } from '@/shared/lib/undo';

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The dialog's name; shown as the heading unless `header` replaces it. */
  title: string;
  /**
   * A header of its own instead of the title and «Закрыть» (the record sheet: «Расход / Доход» and «Закрыть»,
   * or «Назад» and «Сумма»). The title then names the dialog for screen readers only.
   */
  header?: ReactNode;
  /** Optional line under the title (Picker: the operation being changed). */
  subtitle?: ReactNode;
  /** Optional action at the right of the subtitle line («Вся операция ›»). */
  children: ReactNode;
  /** Pinned under the scrolling content: the main button of the sheet. */
  footer?: ReactNode;
  className?: string;
}

const CLOSE_DRAG_PX = 80;

/**
 * The only popup of «Пастель» (docs/pastel/components/Sheet.md): bottom sheet on a scrim, grabber,
 * section-style title with a round «Закрыть». Radix Dialog gives role=dialog, aria-modal, focus trap
 * and Escape; dragging the grabber or the title down closes it. At most one sheet over another.
 * Height is limited to the window minus 64px; the content scrolls inside. Toasts hide meanwhile.
 */
export function Sheet({ open, onOpenChange, title, header, subtitle, children, footer, className }: SheetProps) {
  const sheetOpened = useUndoToastStore((state) => state.sheetOpened);
  const sheetClosed = useUndoToastStore((state) => state.sheetClosed);
  const [dragY, setDragY] = useState(0);
  const drag = useRef<{ startY: number; pointerId: number; dy: number; captured: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    sheetOpened();
    return () => sheetClosed();
  }, [open, sheetOpened, sheetClosed]);

  // Dragging starts on the grabber/title area but never on its buttons, and the pointer is captured
  // only once it really moves — otherwise a mouse click on «Закрыть» would land on the header.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button, a')) return;
    drag.current = { startY: event.clientY, pointerId: event.pointerId, dy: 0, captured: false };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    state.dy = Math.max(0, event.clientY - state.startY);
    if (!state.captured && state.dy > 4) {
      event.currentTarget.setPointerCapture(state.pointerId);
      state.captured = true;
    }
    if (state.captured) setDragY(state.dy);
  };
  const onPointerUp = () => {
    const state = drag.current;
    drag.current = null;
    if (!state) return;
    if (state.dy > CLOSE_DRAG_PX) onOpenChange(false);
    setDragY(0);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay data-pastel="" className="fixed inset-0 z-50 bg-scrim animate-fade-in" />
        <Dialog.Content
          data-pastel=""
          aria-describedby={undefined}
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[calc(100dvh-64px)] w-full max-w-md flex-col',
            'rounded-t-hero bg-sheet text-ink shadow-none outline-none animate-slide-in-up',
            className
          )}
          style={dragY > 0 ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
        >
          <div
            className="flex shrink-0 touch-none flex-col gap-3 px-4 pt-2"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <span aria-hidden="true" className="mx-auto h-[5px] w-9 rounded-pill bg-grabber" />
            {header ? (
              <>
                <Dialog.Title className="sr-only">{title}</Dialog.Title>
                {header}
              </>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <Dialog.Title className="type-section min-w-0">{title}</Dialog.Title>
                <Dialog.Close
                  aria-label="Закрыть"
                  className="flex size-touch shrink-0 items-center justify-center rounded-pill bg-sheet-card text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                >
                  <X className="size-5" strokeWidth={2} />
                </Dialog.Close>
              </div>
            )}
            {subtitle}
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-6 pt-3">
            {children}
          </div>
          {footer && <div className="shrink-0 px-4 pb-6 pt-2">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
