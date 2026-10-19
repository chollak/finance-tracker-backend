import { cn } from '@/shared/lib/utils';

/** Corners of a shape. `cn` does not know the Pastel radius names, so they are not passed in `className`. */
const RADIUS = {
  /** Stripes and circles. */
  pill: 'rounded-pill',
  /** A large figure, such as the balance on its card. */
  tile: 'rounded-tile',
  /** A card or a tile of its own, such as a month tile. */
  card: 'rounded-card',
} as const;

/**
 * A grey shape of the loading skeleton (docs/pastel/components/Skeleton.md): pulses opacity
 * 1 → 0.55 over 1.6s, still under prefers-reduced-motion. Shapes copy the real layout; no spinner.
 */
export function SkeletonBlock({ className, radius = 'pill' }: { className?: string; radius?: keyof typeof RADIUS }) {
  return <span aria-hidden="true" className={cn('block bg-track motion-safe:animate-pastel-pulse', RADIUS[radius], className)} />;
}
