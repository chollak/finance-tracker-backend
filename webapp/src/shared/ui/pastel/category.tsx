import { cn } from '@/shared/lib/utils';
import { categoryInitial, pastelBgClass, type PastelColor } from '@/shared/lib/pastel/categoryColors';

interface CategoryDotProps {
  name: string;
  color: PastelColor;
  /** 40px in lists (default), 24px in compact places. */
  size?: 'md' | 'sm';
  className?: string;
}

/** Category in a list: a pastel circle with the first letter (no emoji, no icons). */
export function CategoryDot({ name, color, size = 'md', className }: CategoryDotProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-pill font-extrabold text-pastel-ink',
        size === 'md' ? 'size-10 text-[15px]' : 'size-6 text-[12px]',
        pastelBgClass[color],
        className
      )}
    >
      {categoryInitial(name)}
    </span>
  );
}

interface CategoryTileProps {
  name: string;
  color: PastelColor;
  selected?: boolean;
  /** AI guessed this category: dashed 2px ink outline; a press confirms it. */
  guessed?: boolean;
  onSelect: () => void;
  className?: string;
}

/**
 * Category tile on the entry screen (docs/pastel/components/CategoryTile.md): 48px, radius-tile,
 * pastel background, pastel-ink text. Selected — an outer ring (2px of the surface, then 2px ink);
 * the background never changes. Use inside a role="radiogroup".
 */
export function CategoryTile({ name, color, selected = false, guessed = false, onSelect, className }: CategoryTileProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        // Labels wrap to two lines instead of being cut: Uzbek names run ~30% longer.
        'flex min-h-key min-w-0 items-center justify-center rounded-tile px-1 py-1 text-center text-[13px] font-bold leading-[1.15] text-pastel-ink transition-shadow duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        pastelBgClass[color],
        selected && 'ring-2 ring-ink ring-offset-2 ring-offset-bg',
        guessed && !selected && 'outline-2 outline-dashed outline-offset-2 outline-ink',
        className
      )}
    >
      <span className="line-clamp-2 hyphens-auto [overflow-wrap:anywhere]">{name}</span>
    </button>
  );
}
