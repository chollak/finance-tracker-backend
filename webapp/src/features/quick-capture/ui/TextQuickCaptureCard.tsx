import { useRef, useState } from 'react';
import { Loader2, Send, WifiOff } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { cn } from '@/shared/lib/utils';
import { useUserStore } from '@/entities/user/model/store';
import { isGuestId } from '@/shared/lib/utils/guestId';

import { useQuickCapture } from '../api/mutations';
import { toCaptureFeedback } from '../model/toCaptureFeedback';
import { toCaptureErrorFeedback } from '../model/toCaptureErrorFeedback';
import { toCaptureActionHint } from '../model/toCaptureActionHint';
import { CAPTURE_EXAMPLES } from '../model/captureExamples';
import { MAX_CAPTURE_TEXT_LENGTH } from '../model/validateCaptureText';
import {
  CAPTURE_ACTIONS,
  captureActionAccessibleLabel,
  captureActionHintFor,
  nextActiveCaptureAction,
} from '../model/captureActions';
import type { CaptureAction, CaptureActionId } from '../model/captureActions';
import { toCaptureOfflineNotice } from '../model/toCaptureOfflineNotice';
import { useIsOnline } from '../model/useIsOnline';
import type { CaptureFeedbackTone } from '../model/toCaptureFeedback';

interface Feedback {
  tone: CaptureFeedbackTone;
  title: string;
  description?: string;
  /** Server ack's secondary line — date, "Не входит в расходы", "Проверьте в разделе долгов". */
  details?: string;
  /** Where to fix the saved row — text only, this endpoint implements no actions. */
  actionHint?: string;
}

const TONE_STYLES: Record<CaptureFeedbackTone, string> = {
  success: 'border-success/40 bg-success-muted',
  warning: 'border-warning/50 bg-warning-muted',
  info: 'border-border bg-muted',
};

interface TextQuickCaptureCardProps {
  className?: string;
}

interface CaptureActionTileProps {
  action: CaptureAction;
  isActive: boolean;
  isEmphasized: boolean;
  onPress: (id: CaptureActionId) => void;
}

/**
 * One entry point in the action row.
 *
 * An unavailable action carries no disabled state at all — neither `disabled` nor
 * `aria-disabled`. The tile is fully operable, because pressing it is the only way to read why
 * the action is unavailable and what to do instead; a disabled marker would tell a screen
 * reader (and anything driving the page) not to touch the one control that explains itself.
 * "Unavailable" lives in the accessible name, the `Скоро` badge and the muted/dashed styling,
 * which is where a user can actually perceive it.
 */
function CaptureActionTile({ action, isActive, isEmphasized, onPress }: CaptureActionTileProps) {
  const Icon = action.icon;

  return (
    <button
      type="button"
      onClick={() => onPress(action.id)}
      // Any tile with a panel is a toggle, available or not — pressing it opens and closes the
      // same hint, so the pressed state is real and worth announcing.
      aria-pressed={action.hint ? isActive : undefined}
      aria-label={captureActionAccessibleLabel(action)}
      // Hover/long-press affordance on top of the badge; the same copy the panel shows.
      title={action.isAvailable ? undefined : action.hint}
      data-unavailable={action.isAvailable ? undefined : 'true'}
      className={cn(
        'flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]',
        action.isAvailable
          ? 'border-input bg-background hover:bg-accent hover:text-accent-foreground'
          : 'border-dashed border-input bg-muted/40 text-muted-foreground',
        isEmphasized && action.isAvailable && 'border-primary/40 bg-secondary',
        isActive && 'ring-2 ring-ring ring-offset-2'
      )}
    >
      <Icon
        className={cn('h-5 w-5', action.isAvailable ? 'text-foreground' : 'text-muted-foreground')}
        aria-hidden="true"
      />
      <span className="text-sm font-medium leading-none">{action.label}</span>
      <span className="text-[11px] leading-none text-muted-foreground">
        {action.badge ?? action.caption}
      </span>
    </button>
  );
}

/**
 * Home quick capture — one line of text → POST /api/quick-capture.
 *
 * The same boundary the Telegram bot uses, so a capture is confirmed with the same Russian
 * wording in both channels. Feedback comes from the server ack via `toCaptureFeedback()`:
 * `no_transaction` never claims a save, and the text is kept so it can be rewritten.
 *
 * The action row above the input names the three entry points the product is heading for —
 * scan, voice, type — but only claims what exists today: typing runs here, voice runs in the
 * Telegram chat, scanning is not built. Pressing scan or voice opens a hint, never a recorder.
 */
export function TextQuickCaptureCard({ className }: TextQuickCaptureCardProps) {
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [activeAction, setActiveAction] = useState<CaptureActionId | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const userId = useUserStore((state) => state.userId);
  const userName = useUserStore((state) => state.userName);
  const capture = useQuickCapture();
  const isOnline = useIsOnline();

  const isGuest = !!userId && isGuestId(userId);
  const offlineNotice = toCaptureOfflineNotice(isOnline);
  const activeActionHint = captureActionHintFor(activeAction);
  const canSubmit = !!userId && isOnline && !capture.isPending && text.trim().length > 0;

  /**
   * Scan and voice open their hint; manual hands focus to the textarea, which is the capture
   * this card actually performs. Nothing here starts a recording or a scan — there is none to
   * start, so a tap only ever changes what is explained on screen.
   */
  const handleActionPress = (id: CaptureActionId) => {
    setActiveAction((current) => nextActiveCaptureAction(current, id));

    if (id === 'manual') {
      textareaRef.current?.focus();
    }
  };

  /**
   * An example is a starting point, not a shortcut: it replaces the text and hands focus back
   * so the amount can be corrected before sending. It never submits — a capture writes to the
   * database immediately, and nobody should save a row by tapping a suggestion.
   */
  const applyExample = (example: string) => {
    if (capture.isPending) return;

    setText(example);
    // The old ack described the old text; picking an example starts a different capture.
    setFeedback(null);
    textareaRef.current?.focus();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    // `isOnline` blocks the send rather than letting it fail: the request would only produce a
    // network error, and this card has nowhere to keep a pending capture.
    if (!userId || capture.isPending || !isOnline) return;

    setFeedback(null);

    try {
      const result = await capture.mutateAsync({
        text,
        userId,
        userName: userName || undefined,
      });

      const captureFeedback = toCaptureFeedback(result);
      setFeedback({
        tone: captureFeedback.tone,
        title: captureFeedback.title,
        description: captureFeedback.description,
        details: captureFeedback.details,
        actionHint: toCaptureActionHint(captureFeedback),
      });

      // Keep the text when nothing was written — the user still has to fix or retry it.
      if (captureFeedback.didPersist) {
        setText('');
      }
    } catch (error) {
      setFeedback(toCaptureErrorFeedback(error));
    }
  };

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader>
        <CardTitle>Быстрая запись</CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {isGuest ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            В гостевом режиме быстрая запись текстом недоступна: она сохраняет операции на
            сервере, а гостевые данные хранятся только в этом браузере. Войдите через Telegram,
            напишите операцию боту или добавьте её вручную.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3" aria-busy={capture.isPending}>
            {offlineNotice && (
              <div role="status" className="flex gap-3 rounded-xl border border-warning/50 bg-warning-muted px-4 py-3">
                <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium leading-tight">{offlineNotice.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {offlineNotice.description}
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Способы записи">
              {CAPTURE_ACTIONS.map((action) => (
                <CaptureActionTile
                  key={action.id}
                  action={action}
                  isActive={activeAction === action.id}
                  // Voice is the fastest way to capture today — it just happens in the Telegram
                  // chat, not here, which is what the tile's caption says.
                  isEmphasized={action.id === 'voice'}
                  onPress={handleActionPress}
                />
              ))}
            </div>

            {activeActionHint && (
              <p role="status" className="rounded-xl border border-border bg-muted px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                {activeActionHint}
              </p>
            )}

            <label htmlFor="quick-capture-text" className="sr-only">
              Операция текстом
            </label>
            <textarea
              id="quick-capture-text"
              ref={textareaRef}
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={2}
              maxLength={MAX_CAPTURE_TEXT_LENGTH}
              disabled={capture.isPending}
              placeholder="такси 18к, кофе 35к"
              className="flex w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />

            <div className="flex flex-wrap gap-2" role="group" aria-label="Примеры операций">
              {CAPTURE_EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => applyExample(example)}
                  disabled={capture.isPending}
                  className="min-h-11 rounded-full border border-input bg-background px-4 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {example}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Одной строкой, как боту в Telegram
              </p>
              <Button
                type="submit"
                size="sm"
                className="min-h-11 shrink-0 px-4"
                disabled={!canSubmit}
              >
                {capture.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    Записываю…
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                    Записать
                  </>
                )}
              </Button>
            </div>
          </form>
        )}

        {feedback && (
          <div
            role={feedback.tone === 'warning' ? 'alert' : 'status'}
            className={cn('rounded-xl border px-4 py-3', TONE_STYLES[feedback.tone])}
          >
            <p className="text-sm font-medium leading-tight">{feedback.title}</p>
            {feedback.description && (
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {feedback.description}
              </p>
            )}
            {feedback.details && (
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {feedback.details}
              </p>
            )}
            {feedback.actionHint && (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {feedback.actionHint}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
