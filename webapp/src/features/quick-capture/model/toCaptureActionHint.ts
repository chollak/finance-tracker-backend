import type { CaptureFeedback } from './toCaptureFeedback';

/** Everything the hint needs: which hints the ack offered, and whether a row exists to fix. */
export type CaptureActionHintInput = Pick<CaptureFeedback, 'actions' | 'savedTransactionCount'>;

/**
 * Turns the ack's `edit` / `delete` / `review` hints into one line of plain text.
 *
 * `POST /api/quick-capture` does not implement those actions — edit and delete go through the
 * existing transaction routes (docs/QUICK_CAPTURE_API.md), and the row this ack describes is
 * already saved and already rendered in the recent-transactions list below this card. Showing
 * them as buttons here would mean buttons that do nothing, so they stay text pointing at the
 * place the correction actually happens.
 *
 * That place only exists when a transaction was written. A debt-only capture ("занял 200к у
 * Алишера") persists a debt and still carries `review`, but nothing appears in the list below,
 * so pointing there would send the user looking for a row that is not coming. The ack's own
 * `details` ("Проверьте в разделе долгов") already names the right place — this returns
 * nothing rather than contradict it.
 *
 * `review` wins when both are present: it is the reason the user has to look at all.
 */
export function toCaptureActionHint({
  actions,
  savedTransactionCount,
}: CaptureActionHintInput): string | undefined {
  if (savedTransactionCount === 0) {
    return undefined;
  }

  if (actions.includes('review')) {
    return 'Проверьте запись в списке операций ниже';
  }

  if (actions.includes('edit') || actions.includes('delete')) {
    return 'Изменить или удалить — в списке операций ниже';
  }

  return undefined;
}
