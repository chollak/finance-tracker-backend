import { SkeletonBlock } from '@/shared/ui/pastel';

export const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink';
export const FOCUS_INSET = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink';

/** The chevrons of the boards, 20×20 in `currentColor`. */
export function Chevron({ to, size = 18 }: { to: 'left' | 'right'; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path
        d={to === 'left' ? 'M12.5 4.5 7 10l5.5 5.5' : 'M7.5 4.5 13 10l-5.5 5.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The bars of an empty month (EmptyState.md: «иконка столбцов»). */
export const BARS_ICON = (
  <svg viewBox="0 0 20 20">
    <path d="M4 16V9m4 7V5m4 11v-5m4 5V7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export { ReadFailed } from '@/shared/ui/pastel';

/** Rows still being read: grey circles and stripes in a card (Skeleton.md), no spinner. */
export function LoadingRows({ rows }: { rows: number }) {
  return (
    <div className="rounded-card bg-card px-2 py-1" aria-hidden="true">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex h-row items-center gap-3 px-2">
          <SkeletonBlock className="size-10 shrink-0" />
          <div className="flex flex-1 flex-col gap-2">
            <SkeletonBlock className="h-3.5 w-28" />
            <SkeletonBlock className="h-1.5 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

