import { Link } from 'react-router-dom';
import { cn } from '@/shared/lib/utils';
import { ROUTES } from '@/shared/lib/constants/routes';
import { Wordmark } from '@/shared/ui/pastel';
import { useIsGuest } from '@/entities/user';
import { DisplayCurrencySwitch } from '@/features/display-currency';

/**
 * Home header of «Пастель» (FT-110, boards «Главная», «Главная · тёмная»): the daftar sign on the left; on
 * the right «Сум / USD» (FT-137) — the currency of the balance card and the month tiles — and the round
 * «Ещё», 48px, `track`. There is no bottom bar: the sections Home does not open itself are in «Ещё». Guests
 * have no balance card and no tiles, so they have no switch either.
 */
export function HomeHeader({ className }: { className?: string }) {
  const isGuest = useIsGuest();

  return (
    <header className={cn('flex h-key items-center justify-between gap-3', className)}>
      <Wordmark />
      <div className="flex items-center gap-2">
        {!isGuest && <DisplayCurrencySwitch />}
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
      </div>
    </header>
  );
}
