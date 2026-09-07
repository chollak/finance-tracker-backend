import { motion, useReducedMotion } from 'motion/react';
import {
  createContext,
  useContext,
  useId,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/shared/lib/utils';

const SPRING_LAYOUT = {
  type: 'spring',
  stiffness: 360,
  damping: 32,
  mass: 0.6,
} as const;

type DockContextValue = {
  size: number;
  pillLayoutId: string;
};

const DockContext = createContext<DockContextValue | null>(null);

export interface DockProps {
  children: ReactNode;
  className?: string;
  size?: number;
}

/**
 * The bottom navigation bar, built to the shape `design-guidelines.md` specifies for it:
 * flush to the bottom edge, full width, a hairline top border, translucent card fill over a
 * blur, and `pb-safe` for the home indicator.
 *
 * It used to be a floating rounded card — `max-w-sm`, a 26px radius and a drop shadow, sitting
 * 11px above the bottom edge over a gradient scrim. That shape had two costs the guidelines
 * name directly: content stayed visible through and beside it (the scrim only faded, it never
 * covered), and nav plus scrim occupied about an eighth of the viewport, near the document's
 * own ">15% of mobile viewport" limit for permanent chrome. A flush bar has nothing to show
 * through and reserves exactly its own height.
 */
export function Dock({ children, size = 44, className }: DockProps) {
  const pillLayoutId = useId();

  const ctx = useMemo<DockContextValue>(
    () => ({ size, pillLayoutId }),
    [size, pillLayoutId]
  );

  return (
    <DockContext.Provider value={ctx}>
      <div
        className={cn(
          // A deliberate departure from the guidelines' `bg-card/80 backdrop-blur-lg`: frosted
          // glass needs something worth frosting behind it. Here `card` and `background` are
          // both pure white, so any alpha renders a transaction row as ghost text under the
          // navigation — measured legible at 85% and still at 95%. Opaque serves the same
          // guideline's stated intent ("no visual noise") better than its literal token does,
          // and with no translucency the blur has nothing left to do.
          'w-full border-t border-border bg-card',
          'pb-[env(safe-area-inset-bottom)]',
          className
        )}
      >
        <div className="mx-auto grid w-full max-w-md grid-cols-4 items-stretch px-1">
          {children}
        </div>
      </div>
    </DockContext.Provider>
  );
}

export interface DockItemProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  active?: boolean;
  /**
   * Route this item navigates to. Given one, the item renders as a real `<Link>` — a tab that
   * goes somewhere is a link, not a button: `<button onClick={navigate}>` loses Ctrl/⌘-click,
   * middle-click and "open in new tab", and announces itself as a toggle rather than as the
   * page you are on.
   */
  href?: string;
  /**
   * Caption under the icon. Without it the whole dock is unlabelled glyphs and the only way to
   * tell tabs apart is guessing the pictogram.
   */
  label?: string;
  'aria-label'?: string;
  onPrefetch?: () => void;
}

export function DockItem({
  children,
  className,
  onClick,
  active,
  href,
  label,
  onPrefetch,
  ...rest
}: DockItemProps) {
  const dock = useContext(DockContext);
  const reduce = useReducedMotion();

  const size = dock?.size ?? 44;
  const pillLayoutId = dock?.pillLayoutId ?? 'dock-pill';

  // No negative z-index. The highlight used to be `-z-10`, which only stayed visible because
  // `backdrop-blur` on the bar happened to create a stacking context that trapped it; once the
  // bar became opaque and lost the blur, the highlight escaped behind the bar's own background
  // and the active tab lost its marker entirely. It now paints in normal order — below the
  // content span, which is positioned and therefore drawn after it.
  const pill = active ? (
    <motion.span
      layoutId={pillLayoutId}
      transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
      className="absolute inset-x-1 inset-y-1 rounded-2xl bg-primary/10"
    />
  ) : null;

  // Every slot fills its grid column, so the four of them are equal by construction and the
  // 44px touch floor is met by height alone.
  const sharedStyle: CSSProperties = label ? { minHeight: size + 12 } : { width: size, height: size };

  const sharedClass = cn(
    'relative flex items-center justify-center transition-colors active:scale-95',
    label ? 'w-full rounded-2xl px-1 py-2' : 'shrink-0 rounded-full',
    'text-muted-foreground hover:text-foreground',
    active && 'text-foreground',
    className
  );

  const interactiveClass = cn(
    sharedClass,
    'cursor-pointer border-0 outline-none',
    !label && 'p-0',
    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
  );

  const content = (
    <>
      {pill}
      <span className="relative flex max-w-full flex-col items-center gap-1">
        {children}
        {label && (
          <span
            className={cn(
              'max-w-full truncate text-[10px] leading-none',
              active ? 'font-semibold' : 'font-medium'
            )}
          >
            {label}
          </span>
        )}
      </span>
    </>
  );

  if (href) {
    return (
      <Link
        to={href}
        onClick={onClick}
        aria-label={rest['aria-label']}
        // The accurate state for a tab pointing at the current page. `aria-pressed` said
        // "toggle button", which is not what a destination is.
        aria-current={active ? 'page' : undefined}
        onMouseEnter={onPrefetch}
        onFocus={onPrefetch}
        onTouchStart={onPrefetch}
        style={sharedStyle}
        className={interactiveClass}
      >
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={rest['aria-label']}
        aria-pressed={active}
        onMouseEnter={onPrefetch}
        onFocus={onPrefetch}
        onTouchStart={onPrefetch}
        style={sharedStyle}
        className={interactiveClass}
      >
        {content}
      </button>
    );
  }

  return (
    <div style={sharedStyle} className={sharedClass}>
      {content}
    </div>
  );
}
