import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/shared/lib/utils';
import { ROUTES } from '@/shared/lib/constants/routes';
import type { OpenedFromState } from '@/shared/lib/navigation';
import { pastelBgClass } from '@/shared/lib/pastel/categoryColors';
import { Button } from '@/shared/ui/pastel';
import type { QuickChip } from '../model/quickChips';
import { MAX_CAPTURE_TEXT_LENGTH } from '../model/validateCaptureText';

export interface ComposerViewProps {
  chips: QuickChip[];
  text: string;
  /** The phrase is being read: the round button waits, the field keeps the text. */
  sending: boolean;
  onText: (text: string) => void;
  onSend: () => void;
  onChip: (chip: QuickChip) => void;
  onVoice: () => void;
  onCamera: () => void;
  /**
   * No connection (FT-129, board «Главная без связи»): the microphone is a `track` circle, not the main button, and
   * says it does not work; the send arrow writes on the device.
   */
  offline?: boolean;
}

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink';

function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12.5" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.9" />
    </svg>
  );
}

function KeypadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="currentColor">
      {[5, 10, 15].flatMap((cy) => [5, 10, 15].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.6" />))}
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 16V4M5 9l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The composer at the bottom of Home as the board «Главная» and Composer.md draw it (FT-114), from given
 * chips and text; `Composer` reads them and acts. On the screen's background, fixed to the bottom: the quick
 * chips in one row that scrolls sideways (44px pills in their category's pastel, the name 14px/700 and the
 * amount 500), then the 56px field on `card` with the camera and «Ввести вручную» inside, and the round 56px
 * `primary` button: the microphone while the field is empty, the send arrow once there is text. Without a connection
 * the microphone is on `track` (FT-129).
 */
export function ComposerView({ chips, text, sending, onText, onSend, onChip, onVoice, onCamera, offline = false }: ComposerViewProps) {
  const { pathname } = useLocation();
  const openedFrom: OpenedFromState = { from: pathname };
  const hasText = text.trim().length > 0;

  return (
    <div
      role="region"
      aria-label="Быстрый ввод"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-3xl flex-col gap-2.5 bg-bg pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3"
    >
      {chips.length > 0 && (
        <div role="group" aria-label="Частые операции" className="scrollbar-none flex gap-2 overflow-x-auto px-4">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onChip(chip)}
              aria-label={chip.aria}
              className={cn(
                'flex h-touch shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill px-4 text-[14px] font-bold text-pastel-ink',
                'transition-transform duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                pastelBgClass[chip.color]
              )}
            >
              <span>{chip.name}</span>
              <span className="font-medium tabular-nums opacity-75">{chip.amount}</span>
            </button>
          ))}
        </div>
      )}

      <form
        className="flex gap-2 px-4"
        aria-busy={sending}
        onSubmit={(event) => {
          event.preventDefault();
          if (hasText) onSend();
        }}
      >
        <div className="flex h-button min-w-0 flex-1 items-center gap-1 rounded-pill bg-card pl-5 pr-1.5 focus-within:ring-2 focus-within:ring-ink">
          <label className="flex h-full min-w-0 flex-1 items-center">
            <span className="sr-only">Новая запись текстом</span>
            <input
              type="text"
              value={text}
              onChange={(event) => onText(event.target.value)}
              placeholder="Кофе 25к, такси 18к…"
              maxLength={MAX_CAPTURE_TEXT_LENGTH}
              enterKeyHint="send"
              readOnly={sending}
              className="h-touch min-w-0 flex-1 bg-transparent text-[15px] font-medium text-ink outline-none placeholder:text-ink-muted"
            />
          </label>
          <button
            type="button"
            onClick={onCamera}
            aria-label="Фото чека"
            className={cn('flex size-touch shrink-0 items-center justify-center rounded-pill text-ink', FOCUS)}
          >
            <CameraIcon />
          </button>
          <Link
            to={ROUTES.MANUAL_ENTRY}
            state={openedFrom}
            aria-label="Ввести вручную"
            className={cn('flex size-touch shrink-0 items-center justify-center rounded-pill text-ink', FOCUS)}
          >
            <KeypadIcon />
          </Link>
        </div>

        {hasText ? (
          <Button
            type="submit"
            variant="round"
            aria-label={offline ? 'Записать без связи' : 'Распознать текст'}
            disabled={sending}
            aria-busy={sending}
          >
            <SendIcon />
          </Button>
        ) : offline ? (
          <Button variant="round" aria-label="Голосовой ввод — без связи не работает" onClick={onVoice} className="bg-track text-ink">
            <MicIcon />
          </Button>
        ) : (
          <Button variant="round" aria-label="Голосовой ввод" onClick={onVoice}>
            <MicIcon />
          </Button>
        )}
      </form>
    </div>
  );
}
