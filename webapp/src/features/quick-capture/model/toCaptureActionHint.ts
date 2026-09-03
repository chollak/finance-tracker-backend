import type { CaptureAckAction } from './types';

/**
 * Turns the ack's `edit` / `delete` / `review` hints into one line of plain text.
 *
 * `POST /api/quick-capture` does not implement those actions — edit and delete go through the
 * existing transaction routes (docs/QUICK_CAPTURE_API.md), and the row this ack describes is
 * already saved and already rendered in the recent-transactions list below this card. Showing
 * them as buttons here would mean buttons that do nothing, so they stay text pointing at the
 * place the correction actually happens.
 *
 * `review` wins when both are present: it is the reason the user has to look at all.
 */
export function toCaptureActionHint(actions: CaptureAckAction[]): string | undefined {
  if (actions.includes('review')) {
    return 'Проверьте запись в списке операций ниже';
  }

  if (actions.includes('edit') || actions.includes('delete')) {
    return 'Изменить или удалить — в списке операций ниже';
  }

  return undefined;
}
