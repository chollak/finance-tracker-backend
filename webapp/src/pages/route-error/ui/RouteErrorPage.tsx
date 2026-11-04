import { ProblemScreen, Wordmark } from '@/shared/ui/pastel';
import { reloadHere, reloadHome } from '../model/reload';

/** The board's icon: an arrow in a circle — the circle almost closed, the arrowhead a corner at the top right (24px, line 1.8). */
function ReloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20.5 12a8.5 8.5 0 1 1-2.49-6.01L20.5 8.5M20.5 3.5v5h-5"
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
 * A screen that did not open (#240, boards «Что-то пошло не так» and «Что-то пошло не так · тёмная»): its code did not
 * load — often right after Kapelka is updated — or it fell while drawing. ProblemScreen in its `centered` view with the
 * Kapelka sign in the header; no technical text, the failure is in the log. «Обновить» is the main way out: when Home
 * itself fell, «На главную» would lead back to the same failure. Uses no router, so the app's top error boundary shows
 * it outside the router too.
 */
export function RouteErrorPage() {
  return (
    <ProblemScreen
      layout="centered"
      header={<Wordmark />}
      icon={<ReloadIcon />}
      title="Экран не открылся"
      text="Записи на месте. Нажмите «Обновить» — обычно это помогает."
      action={{ label: 'Обновить', onClick: () => reloadHere() }}
      secondary={{ label: 'На главную', onClick: () => reloadHome(), underline: true }}
    />
  );
}
