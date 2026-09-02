import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { cn } from '@/shared/lib/utils';
import { useUserStore } from '@/entities/user/model/store';
import { isGuestId } from '@/shared/lib/utils/guestId';

import { useQuickCapture } from '../api/mutations';
import { toCaptureFeedback } from '../model/toCaptureFeedback';
import { toCaptureErrorFeedback } from '../model/toCaptureErrorFeedback';
import { MAX_CAPTURE_TEXT_LENGTH } from '../model/validateCaptureText';
import type { CaptureFeedbackTone } from '../model/toCaptureFeedback';

interface Feedback {
  tone: CaptureFeedbackTone;
  title: string;
  description?: string;
}

const TONE_STYLES: Record<CaptureFeedbackTone, string> = {
  success: 'border-success/40 bg-success-muted',
  warning: 'border-warning/50 bg-warning-muted',
  info: 'border-border bg-muted',
};

interface TextQuickCaptureCardProps {
  className?: string;
}

/**
 * Home quick capture — one line of text → POST /api/quick-capture.
 *
 * The same boundary the Telegram bot uses, so a capture is confirmed with the same Russian
 * wording in both channels. Feedback comes from the server ack via `toCaptureFeedback()`:
 * `no_transaction` never claims a save, and the text is kept so it can be rewritten.
 */
export function TextQuickCaptureCard({ className }: TextQuickCaptureCardProps) {
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const userId = useUserStore((state) => state.userId);
  const userName = useUserStore((state) => state.userName);
  const capture = useQuickCapture();

  const isGuest = !!userId && isGuestId(userId);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userId || capture.isPending) return;

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
          <form onSubmit={handleSubmit} className="space-y-3">
            <label htmlFor="quick-capture-text" className="sr-only">
              Операция текстом
            </label>
            <textarea
              id="quick-capture-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={2}
              maxLength={MAX_CAPTURE_TEXT_LENGTH}
              disabled={capture.isPending}
              placeholder="такси 18к, кофе 35к"
              className="flex w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Одной строкой, как боту в Telegram
              </p>
              <Button
                type="submit"
                size="sm"
                className="min-h-11 shrink-0 px-4"
                disabled={capture.isPending || !userId || text.trim().length === 0}
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
