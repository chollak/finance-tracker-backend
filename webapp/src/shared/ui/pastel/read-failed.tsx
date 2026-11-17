import { useIsOffline } from '@/shared/lib/offline';
import { OfflineBar } from './offline-bar';

/** What the line above a failed read says without a connection: the read comes back by itself (`startOfflineSync`). */
export const READ_OFFLINE_TEXT = 'Нет связи — загрузится, когда она вернётся';

interface ReadFailedProps {
  /** What was not read: «Не удалось загрузить операции.» */
  text: string;
  onRetry: () => void;
  retrying: boolean;
}

/**
 * A read failed: the screen says so and reads again (a problem says what to do). Without a connection the «Нет связи»
 * line stands above it (OfflineBar.md, #322): a screen that has nothing kept on the device neither waits on its
 * skeleton nor leaves the reason out.
 */
export function ReadFailed({ text, onRetry, retrying }: ReadFailedProps) {
  const offline = useIsOffline();

  return (
    <div className="flex flex-col gap-3">
      {offline && <OfflineBar text={READ_OFFLINE_TEXT} />}
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
    </div>
  );
}
