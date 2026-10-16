import { cn } from '@/shared/lib/utils';

/**
 * A grey shape of the loading skeleton (docs/pastel/components/Skeleton.md): pulses opacity
 * 1 → 0.55 over 1.6s, still under prefers-reduced-motion. Shapes copy the real layout; no spinner.
 */
export function SkeletonBlock({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('block rounded-pill bg-track motion-safe:animate-pastel-pulse', className)} />;
}
