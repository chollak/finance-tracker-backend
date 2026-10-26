import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';
import { useGoBack, type OpenedFromState } from '@/shared/lib/navigation';
import { ProblemScreen } from '@/shared/ui/pastel';

/** The boards' icons, 24px viewBox, line 1.8: «нет сети» and the crossed camera. */
function OfflineIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const SCREENS = {
  voice: {
    icon: 'M3.5 9a12.5 12.5 0 0 1 4.6-2.8M20.5 9a12.5 12.5 0 0 0-7.4-3.4M6.5 12.5a8 8 0 0 1 3.4-2M17.5 12.5a8 8 0 0 0-1.9-1.3M9.2 16a4 4 0 0 1 5.6 0M12 19.5h.01M3 3l18 18',
    title: 'Голос работает только со связью',
    text: 'Речь распознаётся на сервере. Запишите вручную — запись сохранится на этом устройстве и отправится, когда связь вернётся.',
  },
  receipt: {
    icon: 'M4 8.5h3l1.5-2.5h7L17 8.5h3v10H4v-10ZM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 3l18 18',
    title: 'Чек читается только со связью',
    text: 'Чеки распознаются на сервере. Запишите сумму вручную — запись сохранится на этом устройстве. Когда связь вернётся, чек можно снять и дополнить им запись.',
  },
} as const;

/**
 * Voice and receipts without a connection (FT-129, boards «Голос без связи» and «Чек без связи», ProblemScreen.md):
 * both are read on the server, so the screen says so honestly and offers the one exit that surely works — «Ввести
 * вручную», whose record is kept on the device and sent with the connection. «Отмена» goes back. The microphone and the
 * camera of Home's composer open it while there is no connection; voice in the app (FT-117) and receipts (FT-134) will
 * show their own screens online.
 */
export function CaptureOfflinePage({ kind }: { kind: keyof typeof SCREENS }) {
  const navigate = useNavigate();
  const goBack = useGoBack();
  const screen = SCREENS[kind];
  // The manual entry takes this screen's place and returns to Home after the save
  const openedFrom: OpenedFromState = { from: ROUTES.HOME };

  return (
    <ProblemScreen
      layout="centered"
      header={
        <button
          type="button"
          onClick={goBack}
          className="flex h-touch items-center rounded-pill bg-card px-4 text-[14px] font-bold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          Отмена
        </button>
      }
      icon={<OfflineIcon path={screen.icon} />}
      title={screen.title}
      text={screen.text}
      action={{ label: 'Ввести вручную', onClick: () => navigate(ROUTES.MANUAL_ENTRY, { replace: true, state: openedFrom }) }}
    />
  );
}

export function VoiceOfflinePage() {
  return <CaptureOfflinePage kind="voice" />;
}

export function ReceiptOfflinePage() {
  return <CaptureOfflinePage kind="receipt" />;
}
