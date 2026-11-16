import { closeMiniApp } from '@/shared/lib/telegram';
import { ProblemScreen, Wordmark } from '@/shared/ui/pastel';

/** A clock, as ProblemScreen names it for a situation of time (24px, line 1.8, as the other centered screens). */
function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 7.5V12l3 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Inside Telegram the server stopped taking the Mini App's initData (#316): it lives 24 hours, and Telegram renews it
 * only when the Mini App is opened again — a Mini App left open or minimised longer gets 401 on every request.
 * ProblemScreen in its `centered` view with the Kapelka sign, as «Такой страницы нет» and «Экран не открылся». The one
 * way out is closing the Mini App: the page cannot open it again, and a repeat would get the same refusal. Records
 * waiting in the outbox stay on the device and go after the new opening.
 */
export function MiniAppReopenPage() {
  return (
    <ProblemScreen
      layout="centered"
      header={<Wordmark />}
      icon={<ClockIcon />}
      title="Откройте Kapelka заново"
      text="Kapelka была открыта слишком долго. Закройте её и откройте снова из чата с ботом — записи на месте, а те, что ждут отправки, уйдут сами."
      action={{ label: 'Закрыть Kapelka', onClick: closeMiniApp }}
    />
  );
}
