import { useAccounts } from '@/entities/account';
import { useCategories } from '@/entities/category';
import { useSettings } from '@/entities/settings';
import { useFrequentRecords } from '@/entities/transaction';
import { showUndoToast } from '@/shared/lib/undo';
import { useQuickChip } from '../api/useQuickChip';
import { useSendCapture } from '../api/useSendCapture';
import { RECEIPT_NOT_YET, VOICE_NOT_YET, type CaptureNotice } from '../model/captureNotices';
import { useCaptureStore } from '../model/captureStore';
import { quickChips } from '../model/quickChips';
import { ComposerView } from './ComposerView';

const notify = (notice: CaptureNotice) => showUndoToast({ kind: 'info', title: notice.title, detail: notice.detail });

/**
 * The composer at the bottom of Home (FT-114, Composer.md): quick chips that write in one tap, the field
 * whose text goes to recognition and then to the review of its records, «Ввести вручную». The microphone
 * and the camera say honestly where voice and receipts work today, until FT-117 and FT-135 bring them here.
 */
export function Composer() {
  const draft = useCaptureStore((state) => state.draft);
  const setDraft = useCaptureStore((state) => state.setDraft);
  const frequent = useFrequentRecords();
  const categories = useCategories();
  const accounts = useAccounts();
  const settings = useSettings();
  const { send, isPending } = useSendCapture();
  const { write } = useQuickChip();

  // A failed read of the frequent records falls back to the starters
  const frequentRecords = frequent.isError ? [] : frequent.data;
  const chips = quickChips({
    frequent: categories.data ? frequentRecords : undefined,
    categories: categories.data ?? [],
    accounts: accounts.data?.accounts ?? [],
    defaultAccountId: settings.data?.defaultAccountId,
  });

  return (
    <ComposerView
      chips={chips}
      text={draft}
      sending={isPending}
      onText={setDraft}
      onSend={() => void send(draft)}
      onChip={(chip) => void write(chip)}
      onVoice={() => notify(VOICE_NOT_YET)}
      onCamera={() => notify(RECEIPT_NOT_YET)}
    />
  );
}
