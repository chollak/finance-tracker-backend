import type { Ref } from 'react';
import type { LoginView as LoginState, PendingLogin } from '@/features/web-login';
import { ProblemScreen, Wordmark } from '@/shared/ui/pastel';

/** The board's icons: a door with an arrow, a chat bubble with dots, a clock (20×20, 1.7px lines). */
function DoorIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.5 4H15.5v12H11.5M3.5 10h8.5M9 6.5 12.5 10 9 13.5" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor">
      <path d="M3.5 4.5h13v8.5h-7l-4 3v-3h-2v-8.5Z" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M7 9h.01M10 9h.01M13 9h.01" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm0-10.5V10l2.5 1.5" />
    </svg>
  );
}

export const LOGIN_STEPS = [
  'Откроется чат с ботом Daftar',
  'Нажмите там «Запустить» и «Подтвердить»',
  'Вернитесь сюда — вход завершится сам',
];

/** What a screen reader hears when the screen changes. */
export function loginLiveText(view: LoginState): string {
  if (view.kind === 'waiting') return 'Ждём подтверждения в Telegram';
  if (view.kind === 'signing-in') return 'Вход подтверждён. Открываю Daftar';
  if (view.kind === 'expired') return 'Вход не подтвердили. Можно попробовать снова';
  return '';
}

interface LoginViewProps {
  view: LoginState;
  login: PendingLogin | null;
  /** «5 минут, до 19:47» for the login under way. */
  expiry: string | null;
  busy: boolean;
  onStart: () => void;
  onCancel: () => void;
  titleRef?: Ref<HTMLHeadingElement>;
}

/**
 * The login screen by a direct link (FT-128): «Вход по прямой ссылке», «Вход · ждём подтверждения», «Вход не
 * подтвердили», «Вход · тёмная». One layout — ProblemScreen with the logo — in three states.
 */
export function LoginView({ view, login, expiry, busy, onStart, onCancel, titleRef }: LoginViewProps) {
  const header = <Wordmark />;
  const live = (
    <p role="status" className="sr-only">
      {loginLiveText(view)}
    </p>
  );

  if ((view.kind === 'waiting' || view.kind === 'signing-in') && login) {
    return (
      <>
        {live}
        <ProblemScreen
          layout="entry"
          header={header}
          icon={<ChatIcon />}
          iconPulse
          title="Подтвердите вход в Telegram"
          titleRef={titleRef}
          text="В чате с ботом Daftar нажмите «Подтвердить» — вход здесь завершится сам."
          action={{ label: 'Открыть Telegram', href: login.link }}
          secondary={{ label: 'Отменить вход', onClick: onCancel, underline: true }}
        >
          <p className="text-[14px] font-semibold leading-normal text-ink-muted">
            Чат не открылся или кнопки нет? Нажмите «Открыть Telegram», а в чате — «Запустить».
          </p>
          {expiry && (
            <div className="flex flex-col gap-0.5 rounded-card bg-card px-4 py-3.5">
              <span className="text-[13px] font-bold text-ink-muted">Ссылка для входа действует</span>
              <span className="text-[15px] font-bold text-ink">{expiry}</span>
            </div>
          )}
        </ProblemScreen>
      </>
    );
  }

  if (view.kind === 'expired') {
    return (
      <>
        {live}
        <ProblemScreen
          layout="entry"
          header={header}
          icon={<ClockIcon />}
          title="Вход не подтвердили"
          titleRef={titleRef}
          text="Ссылка для входа действует 5 минут, и это время вышло. Нажмите ниже — откроется чат с ботом Daftar, там нажмите «Подтвердить»."
          action={{ label: 'Войти через Telegram', onClick: onStart, disabled: busy }}
        />
      </>
    );
  }

  return (
    <>
      {live}
      <ProblemScreen
        layout="entry"
        header={header}
        icon={<DoorIcon />}
        title="Траты и доходы — голосом, текстом и фото чека"
        titleRef={titleRef}
        text="Daftar живёт в Telegram. Войдите тем же аккаунтом — в браузере будут те же счета и записи, что в боте."
        steps={LOGIN_STEPS}
        action={{ label: 'Войти через Telegram', onClick: onStart, disabled: busy }}
        note="Пароль не нужен. Daftar видит только ваше имя в Telegram — не чаты и не контакты."
      />
    </>
  );
}
