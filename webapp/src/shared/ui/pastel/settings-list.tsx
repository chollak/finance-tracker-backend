import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
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
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-[13px] font-bold text-ink-muted">{title}</h2>
      <div className="overflow-hidden rounded-card bg-card [&>*+*]:border-t [&>*+*]:border-line">{children}</div>
      {note && <p className="px-1 text-[13px] font-medium text-ink-muted">{note}</p>}
    </section>
  );
}

type SettingsRowKind =
  | { kind: 'link'; to: string }
  | { kind: 'sheet'; onClick: () => void }
  | { kind: 'action'; onClick: () => void; disabled?: boolean }
  | { kind: 'static' };

type SettingsRowProps = SettingsRowKind & {
  icon: ReactNode;
  title: string;
  /** Current state in plain words: «Каждый вечер в 21:00», «Выключено». */
  subtitle?: string;
};

function RowBody({ icon, title, subtitle, chevron, outlined }: { icon: ReactNode; title: string; subtitle?: string; chevron: boolean; outlined: boolean }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-pill text-ink [&_svg]:size-5',
          outlined ? 'border-2 border-line' : 'bg-track'
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-bold leading-snug text-ink">{title}</span>
        {subtitle && <span className="text-[13px] font-medium leading-snug text-ink-muted">{subtitle}</span>}
      </span>
      {chevron && <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink-muted" strokeWidth={2} />}
    </>
  );
}

const rowClass =
  'flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink active:bg-track';

/**
 * A row of «Ещё»: link to a section (chevron), button opening a sheet (chevron, aria-haspopup),
 * action in place (no chevron) or static information (outlined icon, not a button).
 */
export function SettingsRow(props: SettingsRowProps) {
  const { icon, title, subtitle } = props;

  if (props.kind === 'link') {
    return (
      <Link to={props.to} className={rowClass}>
        <RowBody icon={icon} title={title} subtitle={subtitle} chevron outlined={false} />
      </Link>
    );
  }

  if (props.kind === 'sheet') {
    return (
      <button type="button" aria-haspopup="dialog" onClick={props.onClick} className={rowClass}>
        <RowBody icon={icon} title={title} subtitle={subtitle} chevron outlined={false} />
      </button>
    );
  }

  if (props.kind === 'action') {
    return (
      <button type="button" onClick={props.onClick} disabled={props.disabled} className={cn(rowClass, 'disabled:active:bg-transparent')}>
        <RowBody icon={icon} title={title} subtitle={subtitle} chevron={false} outlined={false} />
      </button>
    );
  }

  return (
    <div className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5">
      <RowBody icon={icon} title={title} subtitle={subtitle} chevron={false} outlined />
    </div>
  );
}
