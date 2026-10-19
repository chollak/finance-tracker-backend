import { Link } from 'react-router-dom';
import { cn } from '@/shared/lib/utils';
import { ROUTES } from '@/shared/lib/constants/routes';
import { Wordmark } from '@/shared/ui/pastel';

/**
 * Home header of «Пастель» (FT-110, boards «Главная», «Главная · тёмная»): the daftar sign on the left
 * and the round «Ещё» on the right — 48px, `track`. There is no bottom bar: the sections Home does not
 * open itself are in «Ещё».
 *
 * The «Сум / USD» switch beside «Ещё» on the boards changes the currency of the balance card, so it
 * comes with that card (FT-111).
 */
export function HomeHeader({ className }: { className?: string }) {
  return (
    <header className={cn('flex h-key items-center justify-between gap-3', className)}>
      <Wordmark />
      <Link
        to={ROUTES.MORE}
        aria-label="Ещё"
        className={cn(
          'flex size-key shrink-0 items-center justify-center rounded-pill bg-track text-ink',
          'transition-transform duration-150 active:scale-[0.98]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg'
        )}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="4.5" cy="10" r="1.7" fill="currentColor" />
          <circle cx="10" cy="10" r="1.7" fill="currentColor" />
          <circle cx="15.5" cy="10" r="1.7" fill="currentColor" />
        </svg>
      </Link>
    </header>
  );
}
