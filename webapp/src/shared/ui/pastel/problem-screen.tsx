import type { ReactNode } from 'react';
import { Button } from './button';

interface ProblemScreenProps {
  /** Line icon of the situation: crossed microphone, crossed camera, no network, clock. */
  icon: ReactNode;
  /** Names the situation in human words, never «ошибка»: «Ничего не расслышал». */
  title: string;
  /** What happened and what to do, one paragraph. */
  text: string;
  /** Optional numbered steps («Откройте настройки телефона»…). */
  steps?: string[];
  /** The one exit that surely works: «Написать текстом», «Ввести вручную». */
  action: { label: string; onClick: () => void };
  /** A second reasonable path as a text link: «Доступ включён — попробовать снова». */
  secondary?: { label: string; onClick: () => void };
  /** «Отмена» or the logo. */
  header?: ReactNode;
}

/** One template for everything that went wrong (docs/pastel/components/ProblemScreen.md). */
export function ProblemScreen({ icon, title, text, steps, action, secondary, header }: ProblemScreenProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg px-4 pb-6 pt-3">
      {header && <div className="flex min-h-touch items-center">{header}</div>}
      <div className="flex flex-1 flex-col gap-4 pt-10">
        <span
          aria-hidden="true"
          className="flex size-16 items-center justify-center rounded-pill bg-track text-ink [&_svg]:size-7"
        >
          {icon}
        </span>
        <h1 className="text-[27px] font-extrabold leading-tight tracking-[-0.5px] text-ink">{title}</h1>
        <p className="text-[16px] font-medium leading-relaxed text-ink-muted">{text}</p>
        {steps && steps.length > 0 && (
          <ol className="flex flex-col gap-3 rounded-card bg-card p-4">
            {steps.map((step, index) => (
              <li key={step} className="flex items-start gap-3 text-[15px] font-semibold leading-snug text-ink">
                <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-pill bg-track text-[13px] font-extrabold">
                  {index + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="flex flex-col items-center gap-1 pt-6">
        <Button onClick={action.onClick}>{action.label}</Button>
        {secondary && (
          <button
            type="button"
            onClick={secondary.onClick}
            className="h-touch px-3 text-[14px] font-extrabold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink rounded-pill"
          >
            {secondary.label}
          </button>
        )}
      </div>
    </div>
  );
}
