import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet';
import { UsageLimitsCard } from '@/widgets/usage-limits';
import { haptic } from '@/shared/lib/haptic';
import { MORE_DESTINATIONS } from '../model/destinations';

interface MoreSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrefetch?: (href: string) => void;
}

/**
 * Secondary destinations, opened in place from the bottom navigation instead of
 * taking over a whole screen. Two links did not justify a page of their own.
 */
export function MoreSheet({ open, onOpenChange, onPrefetch }: MoreSheetProps) {
  const navigate = useNavigate();

  const go = (href: string) => {
    haptic.tabChanged();
    onOpenChange(false);
    navigate(href);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+1rem)]"
      >
        <SheetHeader className="text-left">
          <SheetTitle>Ещё</SheetTitle>
        </SheetHeader>

        <nav aria-label="Дополнительные разделы" className="mt-2 divide-y divide-border">
          {MORE_DESTINATIONS.map((destination) => {
            const Icon = destination.icon;

            return (
              <button
                key={destination.href}
                type="button"
                onClick={() => go(destination.href)}
                onTouchStart={() => onPrefetch?.(destination.href)}
                onMouseEnter={() => onPrefetch?.(destination.href)}
                className="flex w-full min-h-12 items-center gap-4 py-3 text-left transition-colors active:bg-muted/60"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-tight">{destination.title}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {destination.description}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            );
          })}
        </nav>

        <div className="mt-4">
          <UsageLimitsCard />
        </div>
      </SheetContent>
    </Sheet>
  );
}
