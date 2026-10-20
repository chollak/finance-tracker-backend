import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/shared/lib/utils';

interface SettingsSectionProps {
  title: string;
  /** One explaining line under the card, 13px muted. */
  note?: string;
  children: ReactNode;
}

/** A section of «Ещё» (docs/pastel/components/SettingsList.md): heading, one card, optional note. */
export function SettingsSection({ title, note, children }: SettingsSectionProps) {
  return (
    <section className="flex flex-col gap-1.5">
      {/* The board's own line height and spacing (13px Manrope, `normal`), not the 1.12 and tightening of headings */}
      <h2 className="px-1 text-[13px] font-bold leading-[normal] tracking-normal text-ink-muted">{title}</h2>
      <div className="overflow-hidden rounded-card bg-card py-1 [&>*+*]:border-t [&>*+*]:border-line">{children}</div>
      {note && <p className="mx-1 mt-0.5 text-[13px] font-semibold leading-[1.45] text-ink-muted">{note}</p>}
    </section>
  );
}

type SettingsRowKind =
  | { kind: 'link'; to: string }
  | { kind: 'sheet'; onClick: () => void }
  | {
      kind: 'action';
      onClick: () => void;
      disabled?: boolean;
      /**
       * Done already and blocked until its toast ends (SettingsList.md: «Отправлено — файл уже в чате с ботом»):
       * `aria-disabled`, so focus stays on the row, as on the board; a press does nothing.
       */
      inactive?: boolean;
      /** Working on it: `aria-busy`, and blocked like `inactive`. */
      busy?: boolean;
    }
  | { kind: 'static' };

type SettingsRowProps = SettingsRowKind & {
  icon: ReactNode;
  title: string;
  /** Current state in plain words: «Каждый вечер в 21:00», «Выключено». */
  subtitle?: string;
};

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0 text-ink">
      <path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RowBody({ icon, title, subtitle, chevron, outlined }: { icon: ReactNode; title: string; subtitle?: string; chevron: boolean; outlined: boolean }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-pill text-ink [&_svg]:size-5',
          outlined ? 'border-2 border-track' : 'bg-track'
        )}
      >
        {icon}
      </span>
      <span data-row-text="" className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-[15px] font-bold leading-snug text-ink">{title}</span>
        {subtitle && <span className="text-[13px] font-semibold leading-[1.35] text-ink-muted">{subtitle}</span>}
      </span>
      {chevron && <Chevron />}
    </>
  );
}

const rowBase = 'flex min-h-16 w-full items-center gap-3 py-2 pl-3 pr-3.5 text-left';
const rowClass =
  `${rowBase} transition-colors duration-150 ` +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink active:bg-track';

/**
 * A row of «Ещё»: link to a section (chevron), button opening a sheet (chevron, aria-haspopup),
 * action in place (no chevron) or static information (outlined icon, not a button).
 */
export function SettingsRow(props: SettingsRowProps) {
  const { icon, title, subtitle } = props;

  if (props.kind === 'link') {
    return (
      <Link to={props.to} data-settings-row="" className={rowClass}>
        <RowBody icon={icon} title={title} subtitle={subtitle} chevron outlined={false} />
      </Link>
    );
  }

  if (props.kind === 'sheet') {
    return (
      <button type="button" aria-haspopup="dialog" onClick={props.onClick} data-settings-row="" className={rowClass}>
        <RowBody icon={icon} title={title} subtitle={subtitle} chevron outlined={false} />
      </button>
    );
  }

  if (props.kind === 'action') {
    const blocked = props.inactive || props.busy;
    return (
      <button
        type="button"
        onClick={blocked ? undefined : props.onClick}
        disabled={props.disabled}
        aria-disabled={blocked || undefined}
        aria-busy={props.busy || undefined}
        data-settings-row=""
        className={cn(rowClass, 'disabled:active:bg-transparent aria-disabled:active:bg-transparent')}
      >
        <RowBody icon={icon} title={title} subtitle={subtitle} chevron={false} outlined={false} />
      </button>
    );
  }

  return (
    <div data-settings-row="" className={rowBase}>
      <RowBody icon={icon} title={title} subtitle={subtitle} chevron={false} outlined />
    </div>
  );
}
