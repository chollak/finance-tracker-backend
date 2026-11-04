import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';
import { ProblemScreen, Wordmark } from '@/shared/ui/pastel';

/** The board's icon: a broken link — two chain links apart, with the sparks of the break at the ends (24px, line 1.8). */
function BrokenLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M10.59 7.76 13.41 4.93a4 4 0 0 1 5.66 5.66L16.24 13.41M13.41 16.24 10.59 19.07a4 4 0 0 1-5.66-5.66L7.76 10.59M8 2.5v3M2.5 8h3M16 18.5v3M18.5 16h3"
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
 * Any unknown address of the app (#222, boards «Страница не найдена» and «Страница не найдена · тёмная»): ProblemScreen
 * in its `centered` view with the Kapelka sign in the header. It says the link is old or mistyped and that the records
 * are safe on Home. «На главную» opens Home in this address's place, so «Назад» there does not lead back here.
 */
export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <ProblemScreen
      layout="centered"
      header={<Wordmark />}
      icon={<BrokenLinkIcon />}
      title="Такой страницы нет"
      text="Ссылка устарела или в ней опечатка. Записи на месте — они на главной."
      action={{ label: 'На главную', onClick: () => navigate(ROUTES.HOME, { replace: true }) }}
    />
  );
}
