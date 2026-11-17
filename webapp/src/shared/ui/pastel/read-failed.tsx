import { useIsOffline } from '@/shared/lib/offline';
import { Button } from './button';
import { OfflineBar } from './offline-bar';

/** What the line above a failed read says without a connection: the read comes back by itself (`startOfflineSync`). */
export const READ_OFFLINE_TEXT = 'Нет связи — загрузится, когда она вернётся';

interface ReadFailedProps {
  /** What was not read: «Не удалось загрузить операции.» */
  text: string;
  onRetry: () => void;
  /** A retry is under way: the button waits instead of firing twice. */
  retrying?: boolean;
  /**
   * `card` — a screen's content could not be read: the text over the button. `row` — a list inside a form (the manual
   * entry's accounts and categories): one line of a control's height, where the list would stand.
   */
  layout?: 'card' | 'row';
  /** False when a failed read above already carries the «Нет связи» line: it is said once on a screen. */
  offlineLine?: boolean;
}

/**
 * A read failed: the screen says so and reads again (a problem says what to do). Without a connection the «Нет связи»
 * line stands above it (OfflineBar.md, #322): a screen that has nothing kept on the device neither waits on its
 * skeleton nor leaves the reason out.
 */
export function ReadFailed({ text, onRetry, retrying = false, layout = 'card', offlineLine = true }: ReadFailedProps) {
  const offline = useIsOffline();

  return (
    <div className="flex flex-col gap-3">
      {offline && offlineLine && <OfflineBar text={READ_OFFLINE_TEXT} />}
      {layout === 'row' ? (
        <div className="flex min-h-control items-center justify-between gap-3 rounded-control bg-card px-4">
          <p className="type-label text-ink-muted">{text}</p>
          <Button variant="text" onClick={onRetry} disabled={retrying}>
            Попробовать снова
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-1 rounded-card bg-card px-5 pb-2 pt-5">
          <p className="text-[14px] font-medium leading-[1.45] text-ink-muted">{text}</p>
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            aria-busy={retrying}
            className="-ml-3 h-touch rounded-pill px-3 text-[14px] font-extrabold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:text-ink-muted"
          >
            Попробовать снова
          </button>
        </div>
      )}
    </div>
  );
}
