import type { ReactNode, Ref } from 'react';
import { cn } from '@/shared/lib/utils';
import { Button } from './button';

interface ProblemScreenProps {
  /** Line icon of the situation: crossed microphone, crossed camera, no network, clock. */
  icon: ReactNode;
  /** The icon pulses while something is awaited (the login); still with reduced motion. */
  iconPulse?: boolean;
  /** Names the situation in human words, never «ошибка»: «Ничего не расслышал». */
  title: string;
  /** Focus goes here when the situation changes on the same screen (the login boards' `lg-title`). */
  titleRef?: Ref<HTMLHeadingElement>;
  /** What happened and what to do, one paragraph. */
  text: string;
  /** Optional numbered steps («Откройте настройки телефона»…). */
  steps?: string[];
  /** What else the screen says under the text: a hint, a card with the time the link lives. */
  children?: ReactNode;
  /** The one exit that surely works: «Написать текстом», «Ввести вручную»; a link when it leaves the app. */
  action: { label: string; onClick?: () => void; href?: string; disabled?: boolean };
  /** A second reasonable path as a text link: «Доступ включён — попробовать снова»; underlined when it undoes. */
  secondary?: { label: string; onClick: () => void; underline?: boolean };
  /** One line under the main button: «Пароль не нужен…». */
  note?: string;
  /** «Отмена» or the logo. */
  header?: ReactNode;
  /**
   * `entry` — the screen starts something rather than reports what went wrong (the login boards): the content sits
   * 72px under a 48px header, the circle is 56px, the title 28px. `centered` — the voice and receipt boards («Голос без
   * связи», «Чек без связи»): the content in the middle between the 48px header and the button, the circle 64px, the
   * title 26px, the text with a line height of 1.5.
   */
  layout?: 'problem' | 'entry' | 'centered';
  /** A whole screen (default) or embedded, e.g. in the component showcase. */
  fullScreen?: boolean;
}

/** One template for everything that went wrong (docs/pastel/components/ProblemScreen.md). */
export function ProblemScreen({
  icon,
  iconPulse = false,
  title,
  titleRef,
  text,
  steps,
  children,
  action,
  secondary,
  note,
  header,
  layout = 'problem',
  fullScreen = true,
}: ProblemScreenProps) {
  const entry = layout === 'entry';
  const centered = layout === 'centered';
  return (
    <div
      className={cn(
        'flex flex-col bg-bg px-4',
        centered ? 'gap-5 pb-4' : 'pb-6',
        entry || centered ? 'pt-2' : 'pt-3',
        fullScreen && 'min-h-dvh'
      )}
    >
      {header && <div className={cn('flex items-center', entry || centered ? 'h-key' : 'min-h-touch')}>{header}</div>}
      <div
        className={cn(
          'flex flex-col gap-4',
          fullScreen && 'flex-1',
          centered ? 'justify-center px-1' : entry ? 'px-1 pt-[88px]' : fullScreen ? 'pt-10' : 'pt-4'
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'flex items-center justify-center rounded-pill bg-track text-ink',
            entry ? 'size-button [&_svg]:size-[26px]' : 'size-16 [&_svg]:size-7',
            iconPulse && '[&_svg]:motion-safe:animate-waiting-pulse'
          )}
        >
          {icon}
        </span>
        <h1
          ref={titleRef}
          tabIndex={titleRef ? -1 : undefined}
          className={cn(
            'font-extrabold text-ink outline-none',
            entry
              ? 'text-[28px] leading-[1.2] tracking-[-0.8px]'
              : centered
                ? 'text-[26px] leading-[1.2] tracking-[-0.8px]'
                : 'text-[27px] leading-tight tracking-[-0.5px]'
          )}
        >
          {title}
        </h1>
        <p className={cn('text-[16px] font-medium text-ink-muted', centered ? 'leading-[1.5]' : 'leading-normal')}>{text}</p>
        {steps && steps.length > 0 && (
          <ol className="mt-2 rounded-card bg-card px-4 py-1">
            {steps.map((step, index) => (
              <li
                key={step}
                className="flex min-h-control items-center gap-3 text-[15px] font-semibold leading-[1.4] text-ink [&+li]:border-t [&+li]:border-line"
              >
                <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-pill bg-track text-[13px] font-extrabold">
                  {index + 1}
                </span>
                <span className="py-1">{step}</span>
              </li>
            ))}
          </ol>
        )}
        {children}
      </div>
      <div className={cn('flex flex-col items-center', centered ? '' : 'pt-6', entry ? 'gap-4' : 'gap-1')}>
        {action.href ? (
          <a
            href={action.href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex h-button w-full shrink-0 items-center justify-center rounded-pill bg-primary px-6 text-center text-on-primary type-button',
              'transition-transform duration-150 active:scale-[0.98]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg'
            )}
          >
            {action.label}
          </a>
        ) : (
          <Button onClick={action.onClick} disabled={action.disabled}>
            {action.label}
          </Button>
        )}
        {secondary &&
          (secondary.underline ? (
            <Button variant="text" onClick={secondary.onClick} className="px-4">
              {secondary.label}
            </Button>
          ) : (
            <button
              type="button"
              onClick={secondary.onClick}
              className="h-touch px-3 text-[14px] font-extrabold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink rounded-pill"
            >
              {secondary.label}
            </button>
          ))}
        {note && <p className="text-center text-[13px] font-semibold leading-[1.45] text-ink-muted">{note}</p>}
      </div>
    </div>
  );
}
