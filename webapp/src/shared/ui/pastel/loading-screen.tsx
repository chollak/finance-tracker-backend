import { cn } from '@/shared/lib/utils';
import { Wordmark } from './wordmark';

/** What a screen reader hears while the screen opens. */
const LOADING_STATUS = 'Открываю Kapelka';

/**
 * A screen other than Home while its code loads or the app reads the user and the settings (#290): the theme's
 * background and the Kapelka sign where the login and the first launch draw it (ProblemScreen's `entry` header), as
 * the login's frame while it first asks about the login (FT-128). No spinner and no «Загрузка» (Skeleton.md); Home has
 * its own skeleton. Only the frame is `aria-busy`: the status line stays outside it, so a screen reader announces it.
 */
export function LoadingScreen({ fullScreen = true }: { fullScreen?: boolean }) {
  return (
    <div className={cn('flex flex-col bg-bg px-4 pb-6 pt-2', fullScreen && 'min-h-dvh')}>
      <p role="status" className="sr-only">
        {LOADING_STATUS}
      </p>
      <div aria-busy="true" className="flex h-key items-center">
        <Wordmark />
      </div>
    </div>
  );
}
