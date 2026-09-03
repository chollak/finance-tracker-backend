import { motion, useReducedMotion } from 'motion/react';
import {
  createContext,
  useContext,
  useId,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from 'react';
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
          'inline-flex h-auto items-end gap-1.5 rounded-2xl border border-border bg-card/85 px-2 py-1 shadow-2xl shadow-black/20 backdrop-blur-xl',
          className
        )}
      >
        {children}
      </div>
    </DockContext.Provider>
  );
}

export interface DockItemProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  active?: boolean;
  'aria-label'?: string;
  variant?: 'default' | 'primary';
  onPrefetch?: () => void;
}

export function DockItem({
  children,
  className,
  onClick,
  active,
  variant = 'default',
  onPrefetch,
  ...rest
}: DockItemProps) {
  const dock = useContext(DockContext);
  const reduce = useReducedMotion();

  const size = dock?.size ?? 44;
  const pillLayoutId = dock?.pillLayoutId ?? 'dock-pill';
  const isPrimary = variant === 'primary';

  const pill = active ? (
    <motion.span
      layoutId={pillLayoutId}
      transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
      className={cn(
        'absolute inset-0.5 -z-10 rounded-xl',
        isPrimary ? 'bg-primary/12' : 'bg-primary/5'
      )}
    />
  ) : null;

  const sharedStyle: CSSProperties = {
    width: size,
    height: size,
  };

  const sharedClass = cn(
    'relative flex shrink-0 items-center justify-center rounded-full transition-colors active:scale-95',
    isPrimary
      ? 'bg-primary text-primary-foreground shadow-sm shadow-black/15'
      : 'text-muted-foreground hover:text-foreground',
    active && !isPrimary && 'text-foreground',
    className
  );

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
        className={cn(
          sharedClass,
          'cursor-pointer border-0 p-0 outline-none',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
        )}
      >
        {pill}
        {children}
      </button>
    );
  }

  return (
    <div style={sharedStyle} className={sharedClass}>
      {pill}
      {children}
    </div>
  );
}

export interface DockSplitProps {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  className?: string;
}

/**
 * Symmetric dock layout: two equal-width side zones (`1fr`) around an
 * intrinsically sized center slot.
 *
 * The center action therefore sits on the container's horizontal axis whatever
 * the side item counts are, so adding or hiding a tab cannot push it off centre.
 * Requires a definite width on the parent `Dock` (e.g. `w-full max-w-xs`).
 */
export function DockSplit({ left, center, right, className }: DockSplitProps) {
  return (
    <div
      className={cn(
        'grid w-full grid-cols-[1fr_auto_1fr] items-center gap-1.5',
        className
      )}
    >
      <div className="flex items-center justify-around">{left}</div>
      <div className="flex items-center gap-1.5">{center}</div>
      <div className="flex items-center justify-around">{right}</div>
    </div>
  );
}

export function DockSeparator({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('mx-0.5 h-6 w-px self-center bg-border', className)}
    />
  );
}
